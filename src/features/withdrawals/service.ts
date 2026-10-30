import "server-only";
import { normalizeKey } from "@/features/imports/columns";
import type { Prisma } from "@/generated/prisma/client";
import { formatDate, formatMoney, parseIsoDate, todayInTimeZone, toIsoDate } from "@/lib/format";
import { paginate } from "@/lib/list/query";
import { fromCents, sumAmounts, toCents } from "@/lib/validators/decimal";
import { recordAudit } from "@/server/audit";
import { assertPermission, hasPermission } from "@/server/authz";
import type { ActorContext } from "@/server/context";
import { AppError, ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { entryKey, fingerprints, runningBalance } from "./calc";
import { MAX_REPORTED_ERRORS, STATEMENT_PAGE_SIZE, WITHDRAWALS_MAX_BYTES } from "./constants";
import {
  checkBalanceDates,
  findHeader,
  inferHeader,
  mapRow,
  parseCellDate,
  sheetKey,
  similarAccounts,
  type Header,
  type ParsedEntry,
  type RowProblem,
} from "./map";
import { readWorkbook } from "./parse";
import * as repo from "./repository";
import {
  accountListQuerySchema,
  entrySchema,
  linkEmployeeSchema,
  SHEET_NEW,
  SHEET_SKIP,
  sheetsSchema,
  statementQuerySchema,
  voidSchema,
} from "./schemas";

const MODULE = "retiros";

/*
 * Cuentas corrientes de retiros: ingresos y retiros de cada persona con su
 * saldo. Cada hoja de las planillas es una cuenta, vinculada a un legajo si
 * existe. Se ven con el permiso de información salarial y se cargan con el de
 * registrarla.
 */

type Amount = { toString(): string } | null;

const fullName = (e: { lastName: string; firstName: string }) => `${e.lastName}, ${e.firstName}`;
const amount = (value: Amount) => fromCents(toCents(value));

type Summary = { credit: string; debit: string; balance: string; lastDate: Date | null; count: number };
const EMPTY: Summary = { credit: "0.00", debit: "0.00", balance: "0.00", lastDate: null, count: 0 };

/**
 * Ingresos, retiros (sin los saldos de la planilla), saldo, último movimiento
 * y cantidad de cada cuenta.
 */
async function summaries(accountIds?: string[]) {
  const byAccount = new Map<string, Awaited<ReturnType<typeof repo.activeMovements>>>();
  for (const row of await repo.activeMovements(accountIds)) {
    const list = byAccount.get(row.accountId) ?? [];
    list.push(row);
    byAccount.set(row.accountId, list);
  }
  const result = new Map<string, Summary>();
  for (const [accountId, rows] of byAccount) {
    const moves = rows.filter((r) => !r.isBalance);
    result.set(accountId, {
      credit: sumAmounts(moves.map((r) => r.credit)),
      debit: sumAmounts(moves.map((r) => r.debit)),
      balance: runningBalance(rows.map((r) => ({ ...r, voided: false }))).closing,
      lastDate: rows.at(-1)?.date ?? null,
      count: moves.length,
    });
  }
  return result;
}

export function canEditWithdrawals(ctx: ActorContext) {
  return hasPermission(ctx, "salary:write");
}

const employeeView = (e: repo.AccountRow["employee"]) =>
  e ? { id: e.id, fileNumber: e.fileNumber, name: fullName(e), status: e.status } : null;

/* ----------------------------------------------------------------------------
 * Consulta
 * ------------------------------------------------------------------------- */

export type AccountItem = Awaited<ReturnType<typeof listAccounts>>["items"][number];

/** Un renglón por cuenta: ingresos, retiros, saldo y último movimiento. */
export async function listAccounts(ctx: ActorContext, rawQuery: unknown) {
  await assertPermission(ctx, "salary:read", MODULE);
  const query = accountListQuerySchema.parse(rawQuery);
  const [accounts, byAccount] = await Promise.all([repo.listAccounts(), summaries()]);
  const q = query.q ? normalizeKey(query.q) : null;
  const all = accounts.map((account) => {
    return {
      id: account.id,
      name: account.name,
      employee: employeeView(account.employee),
      ...(byAccount.get(account.id) ?? EMPTY),
    };
  });
  const filtered = all.filter((item) => {
    if (q) {
      const texts = [item.name, item.employee?.name ?? "", item.employee ? String(item.employee.fileNumber) : ""];
      if (!texts.some((t) => normalizeKey(t).includes(q))) return false;
    }
    if (query.legajo === "con" && !item.employee) return false;
    if (query.legajo === "sin" && item.employee) return false;
    const cents = toCents(item.balance);
    if (query.saldo === "positivo") return cents > 0n;
    if (query.saldo === "negativo") return cents < 0n;
    return true;
  });
  const start = (query.page - 1) * query.pageSize;
  return {
    ...paginate(filtered.slice(start, start + query.pageSize), filtered.length, query.page, query.pageSize),
    query,
    accountCount: all.length,
    totals: {
      credit: sumAmounts(filtered.map((i) => i.credit)),
      debit: sumAmounts(filtered.map((i) => i.debit)),
      balance: sumAmounts(filtered.map((i) => i.balance)),
    },
  };
}

export async function getAccount(ctx: ActorContext, accountId: string) {
  await assertPermission(ctx, "salary:read", MODULE);
  const account = await repo.findAccount(accountId);
  if (!account) throw new NotFoundError("La cuenta no existe.");
  return { id: account.id, name: account.name, employee: employeeView(account.employee) };
}

export type EmployeeAccount = Awaited<ReturnType<typeof getEmployeeAccounts>>[number];

/** Cuentas vinculadas a un legajo, con su saldo. */
export async function getEmployeeAccounts(ctx: ActorContext, employeeId: string) {
  await assertPermission(ctx, "salary:read", MODULE);
  const accounts = await repo.accountsOfEmployee(employeeId);
  const totals = await summaries(accounts.map((a) => a.id));
  return accounts.map((a) => ({ id: a.id, name: a.name, ...(totals.get(a.id) ?? EMPTY) }));
}

export type StatementRow = Awaited<ReturnType<typeof getStatement>>["rows"][number];

/**
 * Cuenta corriente en orden cronológico, con el saldo después de cada
 * movimiento. Con "desde", la primera línea es el saldo anterior.
 */
export async function getStatement(ctx: ActorContext, accountId: string, rawQuery: unknown) {
  await assertPermission(ctx, "salary:read", MODULE);
  const query = statementQuerySchema.parse(rawQuery);
  const from = query.desde ? parseIsoDate(query.desde)! : null;
  const to = query.hasta ? parseIsoDate(query.hasta)! : null;
  // El saldo se calcula sobre toda la cuenta y después se filtran las fechas.
  const entries = await repo.listEntries(accountId);
  const { rows, closing } = runningBalance(
    entries.map((e) => ({
      id: e.id,
      date: e.date,
      concept: e.concept,
      credit: amount(e.credit),
      debit: amount(e.debit),
      isBalance: e.isBalance,
      origin: e.fileName
        ? [e.fileName, e.sheetName ? `hoja ${e.sheetName}` : null, e.rowNumber ? `fila ${e.rowNumber}` : null]
            .filter(Boolean)
            .join(", ")
        : null,
      createdBy: e.createdBy.name,
      voided: e.voidedAt !== null,
      voidedAt: e.voidedAt,
      voidedBy: e.voidedBy?.name ?? null,
      voidReason: e.voidReason,
    })),
  );
  const lastBalance = (list: typeof rows) => list.findLast((r) => r.balance !== null)?.balance ?? null;
  const before = from ? rows.filter((r) => r.date < from) : [];
  const inRange = rows.filter((r) => (!from || r.date >= from) && (!to || r.date <= to));
  const active = inRange.filter((r) => !r.voided);
  const visible = query.anulados ? inRange : active;
  const pageCount = Math.max(1, Math.ceil(visible.length / STATEMENT_PAGE_SIZE));
  const page = Math.min(query.page ?? pageCount, pageCount);
  const start = (page - 1) * STATEMENT_PAGE_SIZE;
  const shown = visible.slice(start, start + STATEMENT_PAGE_SIZE);
  // Saldo al empezar la página: el de la última línea anterior con saldo.
  const opening = start > 0 ? lastBalance(visible.slice(0, start)) : from ? (lastBalance(before) ?? "0.00") : null;
  const moves = active.filter((r) => !r.isBalance);
  return {
    query,
    /** Saldo anterior a la primera línea de la página, o null si la página empieza la cuenta. */
    opening: start > 0 ? (opening ?? lastBalance(before) ?? "0.00") : opening,
    rows: shown,
    page,
    pageCount,
    total: visible.length,
    pageSize: STATEMENT_PAGE_SIZE,
    voidedCount: inRange.length - active.length,
    period: { credit: sumAmounts(moves.map((r) => r.credit)), debit: sumAmounts(moves.map((r) => r.debit)) },
    balance: closing,
  };
}

export async function getAccountOptions(ctx: ActorContext) {
  await assertPermission(ctx, "salary:write", MODULE);
  return (await repo.listAccounts()).map((a) => ({
    id: a.id,
    label: a.employee ? `${a.name} (${fullName(a.employee)}, legajo ${a.employee.fileNumber})` : a.name,
  }));
}

export async function getEmployeeOptions(ctx: ActorContext) {
  await assertPermission(ctx, "salary:write", MODULE);
  return (await repo.employeeOptions()).map((e) => ({
    id: e.id,
    label: `${fullName(e)} (legajo ${e.fileNumber}${e.status === "EGRESADO" ? ", egresado" : ""})`,
  }));
}

/* ----------------------------------------------------------------------------
 * Carga manual, anulación y legajo
 * ------------------------------------------------------------------------- */

export async function createEntry(ctx: ActorContext, input: unknown) {
  await assertPermission(ctx, "salary:write", MODULE);
  const data = entrySchema.parse(input);
  const account = await repo.findAccount(data.accountId);
  if (!account) throw new ValidationError(undefined, { accountId: ["La cuenta no existe."] });
  const date = parseIsoDate(data.date)!;
  if (date > todayInTimeZone()) {
    throw new ValidationError(undefined, { date: ["La fecha no puede ser posterior a hoy."] });
  }
  const key = entryKey(account.id, data.date, data.credit, data.debit);

  return repo.transaction(async (tx) => {
    // Una carga manual nunca es repetida: si ya hay movimientos iguales, es la siguiente aparición.
    const fingerprint = `${key}|${(await repo.countWithKey(key, tx)) + 1}`;
    const created = await repo.createEntry(
      {
        accountId: account.id,
        date,
        concept: data.concept,
        credit: data.credit,
        debit: data.debit,
        fingerprint,
        source: "MANUAL",
        createdById: ctx.userId,
      },
      tx,
    );
    await recordAudit(
      ctx,
      {
        action: "CREATE",
        module: MODULE,
        entityType: "AccountEntry",
        entityId: created.id,
        after: {
          accountId: account.id,
          date: data.date,
          concept: data.concept,
          credit: data.credit,
          debit: data.debit,
        },
        message: `Movimiento de la cuenta de retiros ${account.name} del ${formatDate(date)}`,
      },
      tx,
    );
    return { id: created.id };
  });
}

/** Anula un movimiento: deja de sumar al saldo pero queda a la vista con el motivo. */
export async function voidEntry(ctx: ActorContext, id: string, input: unknown) {
  await assertPermission(ctx, "salary:write", MODULE);
  const { reason } = voidSchema.parse(input);
  const entry = await repo.findEntry(id);
  if (!entry) throw new NotFoundError();
  if (entry.voidedAt) throw new ConflictError("El movimiento ya estaba anulado.");
  await repo.transaction(async (tx) => {
    const ok = await repo.voidEntry(id, { voidedAt: new Date(), voidedById: ctx.userId, voidReason: reason }, tx);
    if (!ok) throw new ConflictError("Otra persona anuló este movimiento mientras tanto.");
    await recordAudit(
      ctx,
      {
        action: "SOFT_DELETE",
        module: MODULE,
        entityType: "AccountEntry",
        entityId: id,
        before: { date: toIsoDate(entry.date), credit: amount(entry.credit), debit: amount(entry.debit) },
        after: { voidReason: reason },
        message: `Anulación de un movimiento de la cuenta de retiros ${entry.account.name} del ${formatDate(
          entry.date,
        )} (${formatMoney(toCents(entry.credit) > 0n ? entry.credit : entry.debit)})`,
      },
      tx,
    );
  });
  return { id };
}

/** Vincula la cuenta a un legajo, o la desvincula (null). Un legajo puede tener varias cuentas. */
export async function linkAccountEmployee(ctx: ActorContext, accountId: string, input: unknown) {
  await assertPermission(ctx, "salary:write", MODULE);
  const { employeeId } = linkEmployeeSchema.parse(input);
  const account = await repo.findAccount(accountId);
  if (!account) throw new NotFoundError("La cuenta no existe.");
  if (employeeId && !(await repo.employeeExists(employeeId))) {
    throw new ValidationError(undefined, { employeeId: ["El empleado no existe."] });
  }
  if (account.employeeId === employeeId) return { id: accountId };
  await repo.transaction(async (tx) => {
    await repo.linkEmployee(accountId, employeeId, tx);
    await recordAudit(
      ctx,
      {
        action: "UPDATE",
        module: MODULE,
        entityType: "Account",
        entityId: accountId,
        before: { employeeId: account.employeeId },
        after: { employeeId },
        message: employeeId
          ? `Cuenta de retiros ${account.name} vinculada a un legajo`
          : `Cuenta de retiros ${account.name} desvinculada del legajo`,
      },
      tx,
    );
  });
  return { id: accountId };
}

/* ----------------------------------------------------------------------------
 * Importación de planillas
 * ------------------------------------------------------------------------- */

/** Hoja con un nombre nuevo parecido al de una cuenta existente: se pregunta antes de cargarla. */
export type PendingSheet = {
  key: string;
  name: string;
  movements: number;
  /** Primera y última fecha (AAAA-MM-DD). */
  from: string | null;
  to: string | null;
  similar: { id: string; name: string }[];
};

export type FileResult = {
  fileName: string;
  /** Error que impidió leer el archivo: no se cargó nada. */
  error?: string;
  created: number;
  duplicates: number;
  errorCount: number;
  /** Los primeros errores por fila (hasta MAX_REPORTED_ERRORS). */
  errors: RowProblem[];
  /** Movimientos de planillas anteriores que esta cambió o sacó: se anulan. */
  superseded: number;
  /** Cuentas que se crearon con el nombre de una hoja nueva. */
  newAccounts: string[];
  /** Hojas sin movimientos reconocibles (por ejemplo, un resumen). */
  ignoredSheets: string[];
  /** Hojas marcadas como "no importar". */
  skippedSheets: string[];
  pendingSheets: PendingSheet[];
};

type ReadSheet = { name: string; key: string; entries: ParsedEntry[] };

/** Lee un archivo: los movimientos de cada hoja, los errores y las hojas sin datos reconocibles. */
async function readFile(file: File, today: Date) {
  const sheets = (await readWorkbook(file.name, new Uint8Array(await file.arrayBuffer()))).filter(
    (s) => s.rows.length > 0,
  );
  const headers = new Map(sheets.map((s) => [s, findHeader(s)] as const));
  const layouts = [...headers.values()].filter((h): h is Header => h !== null).map((h) => h.columns);
  const read: ReadSheet[] = [];
  const errors: RowProblem[] = [];
  const ignoredSheets: string[] = [];
  for (const sheet of sheets) {
    const header = headers.get(sheet) ?? inferHeader(sheet, layouts);
    if (!header) {
      ignoredSheets.push(sheet.name);
      continue;
    }
    const entries: ParsedEntry[] = [];
    let previousDate: string | null = null;
    for (const row of sheet.rows.slice(header.index + 1)) {
      const result = mapRow(sheet.name, row, header.columns, today, previousDate);
      if (result.kind === "error") errors.push(result.error);
      if (result.kind === "entry") {
        entries.push(result.entry);
        previousDate = result.entry.date;
      } else {
        // Una fila con fecha y sin importes (una nota) también fija la fecha de las siguientes.
        const date = parseCellDate(row.cells[header.columns.fecha!] ?? { text: "" });
        if (date && date <= today) previousDate = toIsoDate(date);
      }
    }
    const { kept, early } = checkBalanceDates(entries);
    for (const { entry, balanceDate } of early) {
      errors.push({
        sheet: sheet.name,
        rowNumber: entry.rowNumber,
        message: `La fecha ${formatDate(parseIsoDate(entry.date)!)} es anterior al saldo de la planilla del ${formatDate(
          parseIsoDate(balanceDate)!,
        )}: revisá el año.`,
      });
    }
    read.push({ name: sheet.name.trim(), key: sheetKey(sheet.name), entries: kept });
  }
  if (read.length === 0) {
    throw new ValidationError(
      'No se encontraron movimientos. Cada hoja necesita las columnas "Fecha", "Ingreso" y "Retiro" (o "Importe").',
    );
  }
  return { sheets: read, errors, ignoredSheets };
}

/** Crea la cuenta de una hoja nueva (o usa la que ya tiene ese nombre) y recuerda la hoja. */
async function openAccount(ctx: ActorContext, name: string, tx: Prisma.TransactionClient) {
  const key = sheetKey(name);
  const account =
    (await repo.listAccounts(tx)).find((a) => a.key === key) ??
    (await repo.createAccount({ name, key, createdById: ctx.userId }, tx));
  await repo.upsertSheet({ key, name, accountId: account.id, updatedById: ctx.userId }, tx);
  return account.id;
}

/**
 * Una planilla nueva copia la del año anterior y a veces corrige o saca
 * filas. Entre la primera y la última fecha que la planilla tiene de una
 * cuenta, los movimientos importados antes que ya no están en ella se anulan
 * (quedan a la vista con el motivo). Solo si la planilla llega hasta el último
 * movimiento importado de la cuenta: una planilla más vieja no corrige a una
 * más nueva.
 */
async function supersede(
  ctx: ActorContext,
  fileName: string,
  entries: (ParsedEntry & { accountId: string })[],
  prints: string[],
  tx: Prisma.TransactionClient,
) {
  const accounts = new Map<
    string,
    { from: string | null; to: string | null; prints: Set<string>; firstOf: Set<string> }
  >();
  entries.forEach((e, i) => {
    const range = accounts.get(e.accountId) ?? { from: null, to: null, prints: new Set<string>(), firstOf: new Set() };
    range.prints.add(prints[i]!);
    // Empieza en la primera fila (en el orden de la hoja, no la fecha más vieja: hay años mal
    // escritos, como 2002 por 2022). El saldo de años anteriores no cuenta: la planilla no trae
    // esos movimientos.
    if (!e.opening) {
      if (!range.from || (!range.firstOf.has(e.sheet) && e.date < range.from)) range.from = e.date;
      range.firstOf.add(e.sheet);
      if (!range.to || e.date > range.to) range.to = e.date;
    }
    accounts.set(e.accountId, range);
  });
  let total = 0;
  for (const [accountId, range] of accounts) {
    if (!range.from || !range.to) continue;
    const imported = await repo.importedEntries(accountId, tx);
    const latest = imported.reduce<string | null>((max, e) => {
      const date = toIsoDate(e.date);
      return !max || date > max ? date : max;
    }, null);
    if (latest && latest > range.to) continue;
    const gone = imported.filter((e) => {
      const date = toIsoDate(e.date);
      return date >= range.from! && date <= range.to! && !range.prints.has(e.fingerprint);
    });
    if (gone.length === 0) continue;
    total += await repo.voidEntries(
      gone.map((e) => e.id),
      {
        voidedAt: new Date(),
        voidedById: ctx.userId,
        voidReason: `Corregido en la planilla ${fileName}`.slice(0, 200),
      },
      tx,
    );
  }
  return total;
}

/** Carga un archivo: crea las cuentas de las hojas nuevas y guarda los movimientos que no estaban. */
async function importFile(ctx: ActorContext, file: File, today: Date): Promise<FileResult> {
  const result: FileResult = {
    fileName: file.name,
    created: 0,
    duplicates: 0,
    errorCount: 0,
    errors: [],
    superseded: 0,
    newAccounts: [],
    ignoredSheets: [],
    skippedSheets: [],
    pendingSheets: [],
  };
  if (file.size === 0) return { ...result, error: "El archivo está vacío." };
  if (file.size > WITHDRAWALS_MAX_BYTES) {
    return { ...result, error: `El archivo supera los ${WITHDRAWALS_MAX_BYTES / 1024 / 1024} MB.` };
  }
  let content: Awaited<ReturnType<typeof readFile>>;
  try {
    content = await readFile(file, today);
  } catch (error) {
    if (error instanceof AppError) return { ...result, error: error.message };
    throw error;
  }
  const { errors } = content;
  result.ignoredSheets = content.ignoredSheets;

  const totals = await repo.transaction(async (tx) => {
    // Una importación por vez: dos a la vez podrían crear la misma cuenta.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('importacion-retiros'))`;
    const assigned = await repo.sheetsByKey(
      content.sheets.map((s) => s.key),
      tx,
    );
    // Solo se compara con las cuentas que ya existían: las hojas de un mismo archivo son personas distintas.
    const existing = await repo.listAccounts(tx);
    const entries: (ParsedEntry & { accountId: string })[] = [];
    for (const sheet of content.sheets) {
      const assignment = assigned.get(sheet.key);
      let accountId = assignment?.accountId;
      if (assignment && accountId === null) {
        result.skippedSheets.push(sheet.name);
        continue;
      }
      if (!accountId) {
        if (sheet.entries.length === 0) continue;
        const similar = similarAccounts(sheet.name, existing);
        if (similar.length > 0) {
          const dates = sheet.entries.map((e) => e.date).sort();
          result.pendingSheets.push({
            key: sheet.key,
            name: sheet.name,
            movements: sheet.entries.length,
            from: dates[0] ?? null,
            to: dates.at(-1) ?? null,
            similar: similar.map((a) => ({ id: a.id, name: a.name })),
          });
          continue;
        }
        accountId = await openAccount(ctx, sheet.name, tx);
        assigned.set(sheet.key, { key: sheet.key, name: sheet.name, accountId });
        result.newAccounts.push(sheet.name);
      }
      for (const entry of sheet.entries) entries.push({ ...entry, accountId });
    }

    const prints = fingerprints(entries.map((e) => entryKey(e.accountId, e.date, e.credit, e.debit)));
    const loaded = await repo.existingFingerprints(prints, tx);
    result.superseded = await supersede(ctx, file.name, entries, prints, tx);
    const createdAt = new Date();
    const count = await repo.createEntries(
      entries.flatMap((e, i) =>
        loaded.has(prints[i]!)
          ? []
          : [
              {
                accountId: e.accountId,
                date: parseIsoDate(e.date)!,
                concept: e.concept,
                credit: e.credit,
                debit: e.debit,
                isBalance: e.opening,
                fingerprint: prints[i]!,
                source: "IMPORTACION" as const,
                fileName: file.name.slice(0, 200),
                sheetName: e.sheet.slice(0, 100),
                rowNumber: e.rowNumber,
                createdById: ctx.userId,
                createdAt,
              },
            ],
      ),
      tx,
    );
    await recordAudit(
      ctx,
      {
        action: "IMPORT",
        module: MODULE,
        entityType: "AccountEntry",
        after: {
          archivo: file.name,
          nuevos: count,
          repetidos: entries.length - count,
          corregidos: result.superseded,
          errores: errors.length,
          cuentasNuevas: result.newAccounts.length,
          hojasPendientes: result.pendingSheets.length,
        },
        message: `Planilla de retiros ${file.name}: ${count} movimientos nuevos, ${entries.length - count} repetidos`,
      },
      tx,
    );
    return { created: count, read: entries.length };
  });
  return {
    ...result,
    created: totals.created,
    duplicates: totals.read - totals.created,
    errorCount: errors.length,
    errors: errors.slice(0, MAX_REPORTED_ERRORS),
  };
}

/**
 * Importa una planilla. El navegador sube las planillas de a una (cada pedido
 * queda bajo el límite de tamaño de Vercel), así que lo que carga una ya
 * cuenta como repetido para las siguientes. No se cargan las filas con
 * errores ni las hojas pendientes: al corregir o asignar y volver a subir el
 * archivo, entran solo esas.
 */
export async function importSpreadsheet(ctx: ActorContext, file: File | null) {
  await assertPermission(ctx, "salary:write", MODULE);
  if (!file) throw new ValidationError("Elegí al menos una planilla.");
  return importFile(ctx, file, todayInTimeZone());
}

/* ----------------------------------------------------------------------------
 * Hojas asignadas
 * ------------------------------------------------------------------------- */

/**
 * Decide a qué cuenta va cada hoja pendiente: una nueva con su nombre, una
 * existente o ninguna ("no importar"). Vale para las próximas importaciones.
 */
export async function saveSheetAssignments(ctx: ActorContext, input: unknown) {
  await assertPermission(ctx, "salary:write", MODULE);
  const { sheets } = sheetsSchema.parse(input);
  await repo.transaction(async (tx) => {
    for (const sheet of sheets) {
      if (sheet.target === SHEET_NEW) {
        await openAccount(ctx, sheet.name, tx);
        continue;
      }
      let accountId: string | null = null;
      if (sheet.target !== SHEET_SKIP) {
        if (!(await repo.findAccount(sheet.target, tx))) {
          throw new ValidationError("Alguna de las cuentas elegidas no existe.");
        }
        accountId = sheet.target;
      }
      const { id, before } = await repo.upsertSheet(
        { key: sheetKey(sheet.name), name: sheet.name, accountId, updatedById: ctx.userId },
        tx,
      );
      if (before && before.accountId === accountId) continue;
      await recordAudit(
        ctx,
        {
          action: before ? "UPDATE" : "CREATE",
          module: MODULE,
          entityType: "AccountSheet",
          entityId: id,
          before: before ? { accountId: before.accountId } : null,
          after: { name: sheet.name, accountId },
          message: accountId
            ? `Hoja "${sheet.name}" de las planillas de retiros asignada a una cuenta existente`
            : `Hoja "${sheet.name}" de las planillas de retiros marcada para no importar`,
        },
        tx,
      );
    }
  });
  return { saved: sheets.length };
}

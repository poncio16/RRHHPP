import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";

type Client = Prisma.TransactionClient | typeof db;

/**
 * Orden cronológico de la cuenta: fecha y, dentro del día, orden de carga y
 * orden de las filas en la hoja (un saldo de la planilla va antes de los
 * movimientos de ese día que lo siguen).
 */
const chronological: Prisma.AccountEntryOrderByWithRelationInput[] = [
  { date: "asc" },
  // El "Saldo al …" de una fecha es el saldo con que empieza ese día.
  { isBalance: "desc" },
  { createdAt: "asc" },
  { rowNumber: { sort: "asc", nulls: "last" } },
  { id: "asc" },
];

/* ----------------------------------------------------------------------------
 * Cuentas
 * ------------------------------------------------------------------------- */

const accountSelect = {
  id: true,
  name: true,
  key: true,
  employeeId: true,
  employee: { select: { id: true, fileNumber: true, lastName: true, firstName: true, status: true } },
} satisfies Prisma.AccountSelect;

export type AccountRow = Prisma.AccountGetPayload<{ select: typeof accountSelect }>;

export async function findAccount(id: string, client: Client = db) {
  return client.account.findUnique({ where: { id }, select: accountSelect });
}

/** Todas las cuentas, por nombre. */
export async function listAccounts(client: Client = db) {
  return client.account.findMany({ orderBy: { name: "asc" }, select: accountSelect });
}

/** Cuentas vinculadas a un legajo (un reingreso suele tener una cuenta nueva). */
export async function accountsOfEmployee(employeeId: string) {
  return db.account.findMany({ where: { employeeId }, orderBy: { createdAt: "asc" }, select: accountSelect });
}

export async function createAccount(
  data: { name: string; key: string; createdById: string },
  tx: Prisma.TransactionClient,
) {
  return tx.account.create({ data, select: accountSelect });
}

export async function linkEmployee(id: string, employeeId: string | null, tx: Prisma.TransactionClient) {
  return tx.account.update({ where: { id }, data: { employeeId }, select: { id: true } });
}

/**
 * Movimientos vigentes (no anulados) en orden cronológico, con lo justo para
 * calcular el saldo: un saldo de la planilla fija el saldo, así que no alcanza
 * con sumar.
 */
export async function activeMovements(accountIds?: string[]) {
  return db.accountEntry.findMany({
    where: { voidedAt: null, ...(accountIds ? { accountId: { in: accountIds } } : {}) },
    orderBy: chronological,
    select: { accountId: true, date: true, credit: true, debit: true, isBalance: true },
  });
}

/** Empleados para vincular a una cuenta, también los egresados. */
export async function employeeOptions() {
  return db.employee.findMany({
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, fileNumber: true, lastName: true, firstName: true, status: true },
  });
}

export async function employeeExists(id: string) {
  return (await db.employee.count({ where: { id } })) === 1;
}

/* ----------------------------------------------------------------------------
 * Movimientos
 * ------------------------------------------------------------------------- */

const entryInclude = {
  createdBy: { select: { name: true } },
  voidedBy: { select: { name: true } },
} satisfies Prisma.AccountEntryInclude;

/** Movimientos de una cuenta (también los anulados), en orden cronológico. */
export async function listEntries(accountId: string) {
  return db.accountEntry.findMany({
    where: { accountId },
    orderBy: chronological,
    include: entryInclude,
  });
}

export async function findEntry(id: string, client: Client = db) {
  return client.accountEntry.findUnique({
    where: { id },
    include: { account: { select: { id: true, name: true } } },
  });
}

/** Movimientos con la misma clave (cuenta, fecha e importes), anulados o no. */
export async function countWithKey(key: string, client: Client = db) {
  return client.accountEntry.count({ where: { fingerprint: { startsWith: `${key}|` } } });
}

/** Huellas ya cargadas (anuladas o no) entre las indicadas. */
export async function existingFingerprints(fingerprints: string[], client: Client = db) {
  const found = new Set<string>();
  // De a tandas: una planilla de un año trae más de diez mil.
  for (let i = 0; i < fingerprints.length; i += 5_000) {
    const rows = await client.accountEntry.findMany({
      where: { fingerprint: { in: fingerprints.slice(i, i + 5_000) } },
      select: { fingerprint: true },
    });
    rows.forEach((r) => found.add(r.fingerprint));
  }
  return found;
}

export async function createEntry(data: Prisma.AccountEntryUncheckedCreateInput, tx: Prisma.TransactionClient) {
  return tx.accountEntry.create({ data, select: { id: true } });
}

/**
 * Inserta los movimientos de una planilla. Una huella que otra carga guardó
 * mientras tanto se saltea (no falla): devuelve cuántos se insertaron.
 */
export async function createEntries(data: Prisma.AccountEntryCreateManyInput[], tx: Prisma.TransactionClient) {
  let count = 0;
  for (let i = 0; i < data.length; i += 2_000) {
    count += (await tx.accountEntry.createMany({ data: data.slice(i, i + 2_000), skipDuplicates: true })).count;
  }
  return count;
}

/** Movimientos importados vigentes de una cuenta (para ver cuáles corrigió una planilla nueva). */
export async function importedEntries(accountId: string, tx: Prisma.TransactionClient) {
  return tx.accountEntry.findMany({
    where: { accountId, source: "IMPORTACION", voidedAt: null },
    select: { id: true, date: true, fingerprint: true },
  });
}

export async function voidEntries(
  ids: string[],
  data: { voidedAt: Date; voidedById: string; voidReason: string },
  tx: Prisma.TransactionClient,
) {
  const { count } = await tx.accountEntry.updateMany({ where: { id: { in: ids }, voidedAt: null }, data });
  return count;
}

/** Anula solo si sigue vigente: devuelve false si otra persona lo anuló antes. */
export async function voidEntry(
  id: string,
  data: { voidedAt: Date; voidedById: string; voidReason: string },
  tx: Prisma.TransactionClient,
) {
  const { count } = await tx.accountEntry.updateMany({ where: { id, voidedAt: null }, data });
  return count === 1;
}

/* ----------------------------------------------------------------------------
 * Hojas de las planillas
 * ------------------------------------------------------------------------- */

export async function sheetsByKey(keys: string[], client: Client = db) {
  const rows = await client.accountSheet.findMany({
    where: { key: { in: keys } },
    select: { key: true, name: true, accountId: true },
  });
  return new Map(rows.map((r) => [r.key, r]));
}

/** Hojas asignadas a una cuenta o marcadas para no importar. */
export async function listSheets() {
  return db.accountSheet.findMany({
    orderBy: { name: "asc" },
    select: { key: true, name: true, accountId: true, account: { select: { name: true } }, updatedAt: true },
  });
}

/** Asigna un nombre de hoja: devuelve la cuenta anterior (undefined si la hoja es nueva). */
export async function upsertSheet(
  data: { key: string; name: string; accountId: string | null; updatedById: string },
  tx: Prisma.TransactionClient,
) {
  const before = await tx.accountSheet.findUnique({ where: { key: data.key }, select: { accountId: true } });
  const saved = await tx.accountSheet.upsert({
    where: { key: data.key },
    create: data,
    update: { accountId: data.accountId, updatedById: data.updatedById },
    select: { id: true },
  });
  return { id: saved.id, before: before ?? undefined };
}

export function transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return db.$transaction(fn, { timeout: 60_000 });
}

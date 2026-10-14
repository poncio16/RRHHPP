import "server-only";
import { randomUUID } from "node:crypto";
import { CATALOGS } from "@/features/catalogs/definitions";
import { createNamedCatalogItem } from "@/features/catalogs/service";
import { createEmployeesBatch } from "@/features/employees/service";
import type { Prisma } from "@/generated/prisma/client";
import { recordAudit } from "@/server/audit";
import { assertPermission, hasPermission } from "@/server/authz";
import type { ActorContext } from "@/server/context";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { CREATABLE_LOOKUPS, IMPORT_MAX_BYTES, IMPORT_MAX_ROWS, normalizeKey, type LookupKey } from "./columns";
import {
  attachNewItems,
  mapRow,
  markDuplicates,
  matchHeaders,
  planNewItems,
  withNewItems,
  type ImportRow,
  type NewCatalogItem,
} from "./map";
import { readSpreadsheet } from "./parse";
import * as repo from "./repository";
import { buildTemplate } from "./template";

const MODULE = "importacion";

/**
 * Contenido de `ImportJob.rows`: las filas, las columnas del archivo que no se
 * reconocieron y los valores de Catálogos que se dan de alta al confirmar
 * (los lotes anteriores a esto no los tienen).
 */
type JobContent = { ignoredColumns: string[]; rows: ImportRow[]; newItems?: NewCatalogItem[] };
const toJson = (content: JobContent) => content as unknown as Prisma.InputJsonValue;
const fromJson = (value: Prisma.JsonValue) => value as unknown as JobContent;

/**
 * Importar es dar de alta legajos con datos personales: exige el permiso de
 * importar y, como el alta manual, escribir legajos y ver datos personales.
 */
export function canImport(ctx: ActorContext) {
  return (
    hasPermission(ctx, "import:run") &&
    hasPermission(ctx, "employee:write") &&
    hasPermission(ctx, "employee.personal:read")
  );
}

async function assertCanImport(ctx: ActorContext) {
  await assertPermission(ctx, "import:run", MODULE);
  await assertPermission(ctx, "employee:write", MODULE);
  await assertPermission(ctx, "employee.personal:read", MODULE);
}

/**
 * Los sectores, puestos y establecimientos que no existen se dan de alta al
 * confirmar si quien importa también administra los catálogos.
 */
export function canCreateCatalogItems(ctx: ActorContext) {
  return hasPermission(ctx, "config:catalogs");
}

export async function getTemplate(ctx: ActorContext) {
  await assertCanImport(ctx);
  const options = await repo.activeOptions();
  const names = Object.fromEntries(Object.entries(options).map(([key, list]) => [key, list.map((o) => o.label)]));
  return buildTemplate(names as Record<LookupKey, string[]>, { createsCatalogs: canCreateCatalogItems(ctx) });
}

/**
 * Lee el archivo, valida estructura y filas, detecta duplicados y guarda el
 * lote para la vista previa. No crea ni modifica legajos.
 */
export async function validateImport(ctx: ActorContext, file: File | null) {
  await assertCanImport(ctx);
  if (!file || file.size === 0) throw new ValidationError("Elegí el archivo a importar.");
  if (file.size > IMPORT_MAX_BYTES) {
    throw new ValidationError(`El archivo supera los ${IMPORT_MAX_BYTES / 1024 / 1024} MB.`);
  }
  const sheet = await readSpreadsheet(file.name, new Uint8Array(await file.arrayBuffer()));

  const { positions, missing, repeated, unknown } = matchHeaders(sheet.headers);
  const structure = [
    ...(missing.length > 0 ? [`Faltan columnas obligatorias: ${missing.join(", ")}.`] : []),
    ...(repeated.length > 0 ? [`Hay columnas repetidas: ${repeated.join(", ")}.`] : []),
  ];
  if (structure.length > 0) {
    throw new ValidationError(`${structure.join(" ")} Usá la plantilla sin cambiar los encabezados.`);
  }
  if (sheet.rows.length === 0) throw new ValidationError("El archivo no tiene filas con datos.");
  if (sheet.rows.length > IMPORT_MAX_ROWS) {
    throw new ValidationError(
      `El archivo tiene ${sheet.rows.length} filas; el máximo es ${IMPORT_MAX_ROWS}. Dividilo en varios archivos.`,
    );
  }

  const lookups = await repo.loadLookups(canCreateCatalogItems(ctx));
  const planned = planNewItems(sheet.rows, positions, lookups, randomUUID);
  const withPlanned = withNewItems(lookups, planned);
  const mapped = sheet.rows.map((row) => mapRow(row.rowNumber, row.cells, positions, withPlanned));
  const existing = await repo.findExistingIdentities({
    dnis: mapped.map((r) => r.dni).filter(Boolean),
    cuils: mapped.map((r) => r.cuil).filter(Boolean),
    fileNumbers: mapped.flatMap((r) => (r.fileNumber ? [r.fileNumber] : [])),
  });
  const { rows, newItems } = attachNewItems(markDuplicates(mapped, existing), planned, lookups.labels);
  const validRows = rows.filter((r) => r.status === "VALIDA").length;

  return repo.createJob({
    type: "EMPLOYEES",
    fileName: file.name.slice(0, 200),
    totalRows: rows.length,
    validRows,
    errorRows: rows.length - validRows,
    rows: toJson({ ignoredColumns: unknown, rows, newItems }),
    createdById: ctx.userId,
  });
}

function summary(rows: ImportRow[]) {
  return {
    valid: rows.filter((r) => r.status === "VALIDA").length,
    errors: rows.filter((r) => r.status === "ERROR").length,
    duplicates: rows.filter((r) => r.status === "DUPLICADA").length,
    created: rows.filter((r) => r.status === "CREADA").length,
  };
}

export async function getImportJob(ctx: ActorContext, id: string) {
  await assertCanImport(ctx);
  const job = await repo.findJob(id);
  if (!job) throw new NotFoundError("La importación no existe.");
  const content = fromJson(job.rows);
  const rows = content.rows.map(({ input: _input, ...row }) => {
    void _input;
    return row;
  });
  return {
    ...job,
    rows,
    ignoredColumns: content.ignoredColumns,
    newItems: content.newItems ?? [],
    summary: summary(rows),
  };
}

export async function listImportJobs(ctx: ActorContext) {
  await assertCanImport(ctx);
  return repo.listJobs(20);
}

/** Saca los datos del alta de las filas: una vez cerrado el lote ya no hacen falta. */
function closedRows(rows: ImportRow[], created: Map<number, number> = new Map()): ImportRow[] {
  return rows.map(({ input: _input, ...row }) => {
    void _input;
    const fileNumber = created.get(row.rowNumber);
    return fileNumber === undefined ? row : { ...row, status: "CREADA", fileNumber };
  });
}

/**
 * Da de alta los valores nuevos de Catálogos, con el id que ya usan las filas.
 * Si mientras tanto alguien cargó uno con el mismo nombre, no se crea nada.
 */
async function createNewItems(
  ctx: ActorContext,
  items: NewCatalogItem[],
  fileName: string,
  tx: Prisma.TransactionClient,
) {
  for (const key of CREATABLE_LOOKUPS) {
    const own = items.filter((item) => item.key === key);
    if (own.length === 0) continue;
    const taken = await repo.catalogKeys(key, tx);
    const clash = own.find((item) => taken.has(normalizeKey(item.name)));
    if (clash) {
      throw new ConflictError(
        `Mientras tanto se cargó "${clash.name}" en ${CATALOGS[key].title}. Descartá esta importación y volvé a subir el archivo.`,
      );
    }
  }
  for (const item of items) {
    await createNamedCatalogItem(ctx, item.key, item, `importación de "${fileName}"`, tx);
  }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Crea los legajos de las filas válidas en una sola transacción, con su
 * auditoría, y cierra el lote. Antes da de alta los sectores, puestos y
 * establecimientos nuevos. Si algo cambió desde la validación (un duplicado
 * nuevo, un catálogo desactivado o cargado) no se crea nada.
 */
export async function confirmImport(ctx: ActorContext, id: string) {
  await assertCanImport(ctx);
  const job = await repo.findJob(id);
  if (!job) throw new NotFoundError("La importación no existe.");
  if (job.status !== "VALIDADO") throw new ConflictError("Esta importación ya fue confirmada o descartada.");
  const content = fromJson(job.rows);
  const rows = content.rows;
  const valid = rows.filter((r) => r.status === "VALIDA" && r.input);
  if (valid.length === 0) throw new ConflictError("No hay filas válidas para importar.");
  const newItems = content.newItems ?? [];
  if (newItems.length > 0) await assertPermission(ctx, "config:catalogs", MODULE);

  const created = await createEmployeesBatch(
    ctx,
    valid.map((r) => ({ rowNumber: r.rowNumber, input: r.input })),
    {
      beforeInsert: async (tx) => {
        if (!(await repo.lockPendingJob(id, tx))) {
          throw new ConflictError("Esta importación ya fue confirmada o descartada.");
        }
        await createNewItems(ctx, newItems, job.fileName, tx);
      },
      afterInsert: async (tx, inserted) => {
        const byRow = new Map(inserted.map((c) => [c.rowNumber, c.fileNumber]));
        const closed = await repo.closeJob(
          id,
          {
            status: "CONFIRMADO",
            rows: toJson({ ...content, rows: closedRows(rows, byRow) }),
            confirmedAt: new Date(),
          },
          tx,
        );
        if (!closed) throw new ConflictError("Esta importación ya fue confirmada o descartada.");
        const skipped = rows.length - valid.length;
        const after: Record<string, string | number> = {
          fileName: job.fileName,
          totalRows: rows.length,
          created: inserted.length,
          skipped,
        };
        if (newItems.length > 0) after.catalogItems = newItems.length;
        const alsoCreated =
          newItems.length > 0
            ? ` y dio de alta ${plural(newItems.length, "valor nuevo", "valores nuevos")} en Catálogos`
            : "";
        await recordAudit(
          ctx,
          {
            action: "IMPORT",
            module: MODULE,
            entityType: "ImportJob",
            entityId: id,
            after,
            message: `Importó ${plural(inserted.length, "empleado", "empleados")} desde "${job.fileName}" (${plural(skipped, "fila sin importar", "filas sin importar")})${alsoCreated}.`,
          },
          tx,
        );
      },
    },
  );
  return { created: created.length, catalogItems: newItems.length };
}

export async function discardImport(ctx: ActorContext, id: string) {
  await assertCanImport(ctx);
  const job = await repo.findJob(id);
  if (!job) throw new NotFoundError("La importación no existe.");
  const content = fromJson(job.rows);
  await repo.transaction(async (tx) => {
    const closed = await repo.closeJob(
      id,
      {
        status: "DESCARTADO",
        rows: toJson({ ...content, rows: closedRows(content.rows) }),
      },
      tx,
    );
    if (!closed) throw new ConflictError("Esta importación ya fue confirmada o descartada.");
    await recordAudit(
      ctx,
      {
        action: "UPDATE",
        module: MODULE,
        entityType: "ImportJob",
        entityId: id,
        before: { status: "VALIDADO" },
        after: { status: "DESCARTADO" },
        message: `Descartó la importación de "${job.fileName}" sin crear legajos.`,
      },
      tx,
    );
  });
}

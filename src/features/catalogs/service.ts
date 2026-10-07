import "server-only";
import { paginate } from "@/lib/list/query";
import { auditDiff, recordAudit, sanitizeForAudit } from "@/server/audit";
import { assertPermission } from "@/server/authz";
import type { ActorContext } from "@/server/context";
import { ConflictError, NotFoundError } from "@/server/errors";
import {
  CATALOGS,
  labelField,
  type CatalogDefinition,
  type CatalogField,
  type CatalogKey,
  type RefSource,
} from "./definitions";
import * as repo from "./repository";
import { catalogItemSchema, catalogListQuerySchema } from "./schemas";

const MODULE = "configuracion";
const PERMISSION = "config:catalogs";

export type CatalogOption = { id: string; label: string; isActive: boolean };
/** Valores de un elemento listos para el formulario (texto, booleano o id). */
export type CatalogFormValues = Record<string, string | boolean>;
export type CatalogListItem = {
  id: string;
  label: string;
  isActive: boolean;
  /** Texto de cada columna del listado, por nombre de campo. */
  display: Record<string, string>;
  formValues: CatalogFormValues;
};

function toFormValue(field: CatalogField, row: Record<string, unknown>): string | boolean {
  const value = row[field.name];
  if (field.type === "boolean") return value === true;
  if (value === null || value === undefined) return "";
  return String(value);
}

function toDisplay(field: CatalogField, row: Record<string, unknown>): string {
  const value = row[field.name];
  if (field.type === "boolean") return value === true ? "Sí" : "No";
  if (field.type === "ref") {
    const related = row[field.relation] as { name?: string; label?: string } | null | undefined;
    return related?.name ?? related?.label ?? "—";
  }
  if (field.type === "hours") return String(value).replace(".", ",");
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function toListItem(def: CatalogDefinition, row: repo.CatalogRow): CatalogListItem {
  return {
    id: row.id,
    label: String(row[labelField(def)]),
    isActive: row.isActive,
    display: Object.fromEntries(def.fields.map((f) => [f.name, toDisplay(f, row)])),
    formValues: Object.fromEntries(def.fields.map((f) => [f.name, toFormValue(f, row)])),
  };
}

/** Datos del registro que se guardan en la auditoría. */
function auditable(def: CatalogDefinition, row: Record<string, unknown>) {
  return Object.fromEntries([...def.fields.map((f) => [f.name, row[f.name]]), ["isActive", row.isActive]]);
}

export async function listCatalog(ctx: ActorContext, key: CatalogKey, rawQuery: unknown) {
  await assertPermission(ctx, PERMISSION, MODULE);
  const def = CATALOGS[key];
  const query = catalogListQuerySchema.parse(rawQuery);
  const { items, total } = await repo.listItems(key, query);
  return {
    ...paginate(
      items.map((row) => toListItem(def, row)),
      total,
      query.page,
      query.pageSize,
    ),
    query,
  };
}

async function optionsFor(source: RefSource, includeIds: string[]): Promise<CatalogOption[]> {
  if (source.kind === "province") return repo.listProvinceOptions();
  if (source.kind === "catalog") return repo.listOptions(source.key, includeIds);
  const key = (Object.keys(CATALOGS) as CatalogKey[]).find((k) => CATALOGS[k].lookupGroup === source.group);
  if (!key) throw new Error(`Lista sin catálogo: ${source.group}`);
  return repo.listOptions(key, includeIds);
}

/**
 * Opciones de los campos de referencia del formulario. `includeIds` agrega
 * valores inactivos que ya están asignados, para que se vean al editar.
 */
export async function getCatalogFormOptions(ctx: ActorContext, key: CatalogKey, includeIds: string[] = []) {
  await assertPermission(ctx, PERMISSION, MODULE);
  const entries = await Promise.all(
    CATALOGS[key].fields.flatMap((field) =>
      field.type === "ref" ? [optionsFor(field.source, includeIds).then((opts) => [field.name, opts] as const)] : [],
    ),
  );
  return Object.fromEntries(entries) as Record<string, CatalogOption[]>;
}

/** Unicidades que la base no puede garantizar (valores nulos o tablas compartidas). */
async function assertUnique(key: CatalogKey, values: Record<string, unknown>, exceptId?: string) {
  const def = CATALOGS[key];
  // Nombres únicos sin distinguir mayúsculas ("Calidad" y "calidad" son el mismo sector).
  const field = labelField(def);
  if (key !== "categorias" && typeof values[field] === "string") {
    const duplicate = await repo.findDuplicate(
      key,
      { [field]: { equals: values[field], mode: "insensitive" } },
      exceptId,
    );
    if (duplicate) {
      const message = "Ya existe un registro con ese nombre.";
      throw new ConflictError(message, { [field]: [message] });
    }
  }
  if (def.lookupGroup && typeof values.code === "string") {
    if (await repo.findDuplicate(key, { code: values.code }, exceptId)) {
      const message = "Ya existe una opción con ese código.";
      throw new ConflictError(message, { code: [message] });
    }
  }
  if (key === "categorias" && typeof values.name === "string") {
    const duplicate = await repo.findDuplicate(
      key,
      { name: { equals: values.name, mode: "insensitive" }, agreementId: values.agreementId ?? null },
      exceptId,
    );
    if (duplicate) {
      const message = "Ya existe esa categoría para el convenio elegido.";
      throw new ConflictError(message, { name: [message] });
    }
  }
}

export async function createCatalogItem(ctx: ActorContext, key: CatalogKey, input: unknown) {
  await assertPermission(ctx, PERMISSION, MODULE);
  const def = CATALOGS[key];
  const data = catalogItemSchema(def, "create").parse(input);
  await assertUnique(key, data);

  return repo.transaction(async (tx) => {
    const created = await repo.createItem(key, data, ctx.userId, tx);
    await recordAudit(
      ctx,
      {
        action: "CREATE",
        module: MODULE,
        entityType: repo.entityType(key),
        entityId: created.id,
        after: sanitizeForAudit(auditable(def, created)),
        message: `Alta de ${def.singular}: ${String(created[labelField(def)])}`,
      },
      tx,
    );
    return { id: created.id };
  });
}

export async function updateCatalogItem(ctx: ActorContext, key: CatalogKey, id: string, input: unknown) {
  await assertPermission(ctx, PERMISSION, MODULE);
  const def = CATALOGS[key];
  const data = catalogItemSchema(def, "update").parse(input);

  await repo.transaction(async (tx) => {
    const current = await repo.findItem(key, id, tx);
    if (!current) throw new NotFoundError();
    await assertUnique(key, { ...current, ...data }, id);
    const updated = await repo.updateItem(key, id, data, ctx.userId, tx);
    const diff = auditDiff(auditable(def, current), auditable(def, updated));
    if (!diff) return;
    await recordAudit(
      ctx,
      {
        action: "UPDATE",
        module: MODULE,
        entityType: repo.entityType(key),
        entityId: id,
        ...diff,
        message: `Modificación de ${def.singular}: ${String(updated[labelField(def)])}`,
      },
      tx,
    );
  });
}

/**
 * Activa o desactiva un elemento. Desactivar no borra nada: el elemento deja
 * de ofrecerse en los formularios pero sigue en los legajos que ya lo usan.
 */
export async function setCatalogItemActive(ctx: ActorContext, key: CatalogKey, id: string, isActive: boolean) {
  await assertPermission(ctx, PERMISSION, MODULE);
  const def = CATALOGS[key];
  await repo.transaction(async (tx) => {
    const current = await repo.findItem(key, id, tx);
    if (!current) throw new NotFoundError();
    if (current.isActive === isActive) return;
    await repo.updateItem(key, id, { isActive }, ctx.userId, tx);
    await recordAudit(
      ctx,
      {
        action: "UPDATE",
        module: MODULE,
        entityType: repo.entityType(key),
        entityId: id,
        before: { isActive: current.isActive },
        after: { isActive },
        message: `${isActive ? "Reactivación" : "Desactivación"} de ${def.singular}: ${String(current[labelField(def)])}`,
      },
      tx,
    );
  });
}

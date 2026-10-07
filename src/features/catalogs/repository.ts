import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import type { CatalogKey } from "./definitions";

type Client = Prisma.TransactionClient | typeof db;
type Where = Record<string, unknown>;

export type CatalogRow = Record<string, unknown> & { id: string; isActive: boolean; sortOrder: number };

/**
 * Subconjunto de los delegados de Prisma que usa el ABM genérico. Todas las
 * tablas de catálogos comparten `id`, `isActive`, `sortOrder` y timestamps.
 */
type CatalogDelegate = {
  findMany(args: {
    where?: Where;
    include?: Where;
    orderBy?: Where[];
    skip?: number;
    take?: number;
    select?: Where;
  }): Promise<CatalogRow[]>;
  count(args: { where?: Where }): Promise<number>;
  findFirst(args: { where: Where; include?: Where }): Promise<CatalogRow | null>;
  create(args: { data: Where }): Promise<CatalogRow>;
  update(args: { where: { id: string }; data: Where }): Promise<CatalogRow>;
};

type TableConfig = {
  delegate: (client: Client) => CatalogDelegate;
  entityType: string;
  /** Filtro fijo (las listas simples comparten la tabla lookup_value). */
  scope?: Where;
  include?: Where;
  searchFields: string[];
  labelField: "name" | "label";
};

const asDelegate = (delegate: unknown) => delegate as CatalogDelegate;
const lookupTable = (group: string): TableConfig => ({
  delegate: (c) => asDelegate(c.lookupValue),
  entityType: "LookupValue",
  scope: { group },
  searchFields: ["label", "code"],
  labelField: "label",
});

const TABLES: Record<CatalogKey, TableConfig> = {
  sectores: {
    delegate: (c) => asDelegate(c.department),
    entityType: "Department",
    searchFields: ["name", "code"],
    labelField: "name",
  },
  puestos: {
    delegate: (c) => asDelegate(c.position),
    entityType: "Position",
    include: { department: { select: { name: true } } },
    searchFields: ["name"],
    labelField: "name",
  },
  establecimientos: {
    delegate: (c) => asDelegate(c.workplace),
    entityType: "Workplace",
    include: { province: { select: { name: true } } },
    searchFields: ["name", "city"],
    labelField: "name",
  },
  convenios: {
    delegate: (c) => asDelegate(c.collectiveAgreement),
    entityType: "CollectiveAgreement",
    searchFields: ["name", "number", "unionName"],
    labelField: "name",
  },
  categorias: {
    delegate: (c) => asDelegate(c.category),
    entityType: "Category",
    include: { agreement: { select: { name: true } } },
    searchFields: ["name"],
    labelField: "name",
  },
  "tipos-contrato": {
    delegate: (c) => asDelegate(c.contractType),
    entityType: "ContractType",
    searchFields: ["name"],
    labelField: "name",
  },
  jornadas: {
    delegate: (c) => asDelegate(c.workdayType),
    entityType: "WorkdayType",
    searchFields: ["name"],
    labelField: "name",
  },
  "obras-sociales": {
    delegate: (c) => asDelegate(c.healthInsurer),
    entityType: "HealthInsurer",
    searchFields: ["name", "rnosCode"],
    labelField: "name",
  },
  art: {
    delegate: (c) => asDelegate(c.artProvider),
    entityType: "ArtProvider",
    searchFields: ["name"],
    labelField: "name",
  },
  "tipos-documento": {
    delegate: (c) => asDelegate(c.documentType),
    entityType: "DocumentType",
    searchFields: ["name"],
    labelField: "name",
  },
  bancos: {
    delegate: (c) => asDelegate(c.bank),
    entityType: "Bank",
    searchFields: ["name", "code"],
    labelField: "name",
  },
  "estado-civil": lookupTable("ESTADO_CIVIL"),
  nacionalidades: lookupTable("NACIONALIDAD"),
  modalidades: lookupTable("MODALIDAD_TRABAJO"),
  "tipos-cuenta": lookupTable("TIPO_CUENTA_BANCARIA"),
  "tipos-egreso": lookupTable("TIPO_EGRESO"),
  "motivos-egreso": lookupTable("MOTIVO_EGRESO"),
};

/**
 * Orden de los listados: las listas simples respetan su orden de carga (por
 * ejemplo, "Otro" al final); el resto va por nombre.
 */
function orderBy(table: TableConfig): Where[] {
  return table.scope ? [{ sortOrder: "asc" }, { label: "asc" }] : [{ name: "asc" }];
}

export function entityType(key: CatalogKey): string {
  return TABLES[key].entityType;
}

export async function listItems(
  key: CatalogKey,
  query: { q?: string; status: "activos" | "inactivos" | "todos"; page: number; pageSize: number },
) {
  const table = TABLES[key];
  const where: Where = {
    ...table.scope,
    ...(query.status === "activos" ? { isActive: true } : query.status === "inactivos" ? { isActive: false } : {}),
    ...(query.q
      ? { OR: table.searchFields.map((field) => ({ [field]: { contains: query.q, mode: "insensitive" } })) }
      : {}),
  };
  const delegate = table.delegate(db);
  const [items, total] = await Promise.all([
    delegate.findMany({
      where,
      include: table.include,
      orderBy: orderBy(table),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    delegate.count({ where }),
  ]);
  return { items, total };
}

export async function findItem(key: CatalogKey, id: string, client: Client = db) {
  const table = TABLES[key];
  return table.delegate(client).findFirst({ where: { id, ...table.scope }, include: table.include });
}

/** Busca otro elemento con los mismos valores (para unicidades que la base no cubre). */
export async function findDuplicate(key: CatalogKey, values: Where, exceptId?: string, client: Client = db) {
  const table = TABLES[key];
  return table.delegate(client).findFirst({
    where: { ...table.scope, ...values, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
  });
}

export async function createItem(key: CatalogKey, data: Where, actorId: string, client: Client) {
  const table = TABLES[key];
  // Los valores nuevos de una lista simple van al final.
  const sortOrder = table.scope
    ? ((await table.delegate(client).findMany({ where: table.scope, orderBy: [{ sortOrder: "desc" }], take: 1 }))[0]
        ?.sortOrder ?? -1) + 1
    : 0;
  // Las listas simples (lookup_value) no registran autor: lo guarda la auditoría.
  const authorship = table.entityType === "LookupValue" ? {} : { createdById: actorId, updatedById: actorId };
  return table.delegate(client).create({ data: { ...table.scope, ...data, sortOrder, ...authorship } });
}

export async function updateItem(key: CatalogKey, id: string, data: Where, actorId: string, client: Client) {
  const table = TABLES[key];
  const authorship = table.entityType === "LookupValue" ? {} : { updatedById: actorId };
  return table.delegate(client).update({ where: { id }, data: { ...data, ...authorship } });
}

/** Opciones (id y nombre) de un catálogo: las activas más las indicadas en `includeIds`. */
export async function listOptions(key: CatalogKey, includeIds: string[] = []) {
  const table = TABLES[key];
  const rows = await table.delegate(db).findMany({
    where: { ...table.scope, OR: [{ isActive: true }, { id: { in: includeIds } }] },
    orderBy: orderBy(table),
    select: { id: true, [table.labelField]: true, isActive: true },
  });
  return rows.map((row) => ({ id: row.id, label: String(row[table.labelField]), isActive: row.isActive }));
}

export async function listProvinceOptions() {
  const rows = await db.province.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  return rows.map((row) => ({ id: row.id, label: row.name, isActive: true }));
}

export function transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return db.$transaction(fn);
}

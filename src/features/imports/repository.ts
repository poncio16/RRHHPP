import "server-only";
import * as catalogs from "@/features/catalogs/repository";
import * as employees from "@/features/employees/repository";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import type { LookupKey } from "./columns";
import { indexByName, type Lookups } from "./map";

type Client = Prisma.TransactionClient | typeof db;

const CATALOG_LOOKUPS = [
  "nacionalidades",
  "estado-civil",
  "sectores",
  "puestos",
  "categorias",
  "convenios",
  "tipos-contrato",
  "jornadas",
  "modalidades",
  "establecimientos",
  "obras-sociales",
  "art",
] as const satisfies readonly LookupKey[];

type Option = { id: string; label: string };

/** Valores activos de cada catálogo que se escribe por nombre. */
export async function activeOptions(): Promise<Record<LookupKey, Option[]>> {
  const [lists, provinces, schedules] = await Promise.all([
    Promise.all(CATALOG_LOOKUPS.map((key) => catalogs.listOptions(key))),
    db.province.findMany({ select: { id: true, name: true, code: true }, orderBy: { name: "asc" } }),
    employees.scheduleOptions([]),
  ]);
  return {
    ...(Object.fromEntries(CATALOG_LOOKUPS.map((key, i): [string, Option[]] => [key, lists[i] ?? []])) as Record<
      (typeof CATALOG_LOOKUPS)[number],
      Option[]
    >),
    provincias: provinces.map((p) => ({ id: p.id, label: p.name })),
    horarios: schedules,
  };
}

/** Catálogos activos indexados por nombre, superiores por legajo y relaciones entre catálogos. */
export async function loadLookups(): Promise<Lookups> {
  const [options, provinceCodes, supervisors, metadata] = await Promise.all([
    activeOptions(),
    db.province.findMany({ select: { id: true, code: true } }),
    db.employee.findMany({ where: { status: "ACTIVO" }, select: { id: true, fileNumber: true } }),
    employees.formMetadata(),
  ]);
  const index = Object.fromEntries(
    Object.entries(options).map(([key, list]) => [key, indexByName(list)]),
  ) as Lookups["options"];
  // La provincia se acepta por nombre o por código.
  index.provincias = indexByName([...options.provincias, ...provinceCodes.map((p) => ({ id: p.id, label: p.code }))]);
  return {
    options: index,
    supervisors: new Map(supervisors.map((e) => [e.fileNumber, e.id])),
    contractTypesWithEndDate: new Set(metadata.contractTypesWithEndDate),
    categoryAgreement: new Map(Object.entries(metadata.categoryAgreement)),
  };
}

/** Legajos (activos o no) que ya usan alguno de esos DNI, CUIL o números de legajo. */
export async function findExistingIdentities(values: { dnis: string[]; cuils: string[]; fileNumbers: number[] }) {
  return db.employee.findMany({
    where: {
      OR: [{ dni: { in: values.dnis } }, { cuil: { in: values.cuils } }, { fileNumber: { in: values.fileNumbers } }],
    },
    select: { fileNumber: true, dni: true, cuil: true, lastName: true, firstName: true },
  });
}

export async function createJob(data: Prisma.ImportJobUncheckedCreateInput) {
  return db.importJob.create({ data, select: { id: true } });
}

export async function findJob(id: string, client: Client = db) {
  return client.importJob.findUnique({
    where: { id },
    include: { createdBy: { select: { name: true } } },
  });
}

export async function listJobs(take: number) {
  return db.importJob.findMany({
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      fileName: true,
      status: true,
      totalRows: true,
      validRows: true,
      errorRows: true,
      createdAt: true,
      confirmedAt: true,
      createdBy: { select: { name: true } },
    },
  });
}

/** Cierra un lote solo si sigue pendiente: devuelve false si otra operación lo cerró antes. */
export async function closeJob(
  id: string,
  data: { status: "CONFIRMADO" | "DESCARTADO"; rows: Prisma.InputJsonValue; confirmedAt?: Date },
  client: Client = db,
) {
  const { count } = await client.importJob.updateMany({ where: { id, status: "VALIDADO" }, data });
  return count === 1;
}

export function transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return db.$transaction(fn);
}

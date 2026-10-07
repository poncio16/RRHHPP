import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import type { EmployeeListQuery } from "./schemas";

type Client = Prisma.TransactionClient | typeof db;

const named = { select: { id: true, name: true } } as const;
const labeled = { select: { id: true, label: true } } as const;

export const employeeDetailInclude = {
  nationality: labeled,
  maritalStatus: labeled,
  province: named,
  department: named,
  position: named,
  category: named,
  agreement: named,
  contractType: { select: { id: true, name: true, hasEndDate: true } },
  workdayType: named,
  workSchedule: named,
  workModality: labeled,
  workplace: named,
  healthInsurer: named,
  artProvider: named,
  supervisor: { select: { id: true, fileNumber: true, lastName: true, firstName: true } },
} satisfies Prisma.EmployeeInclude;

export type EmployeeDetailRecord = Prisma.EmployeeGetPayload<{ include: typeof employeeDetailInclude }>;

const listSelect = {
  id: true,
  fileNumber: true,
  lastName: true,
  firstName: true,
  dni: true,
  hireDate: true,
  status: true,
  department: { select: { name: true } },
  position: { select: { name: true } },
  workplace: { select: { name: true } },
} satisfies Prisma.EmployeeSelect;

export type EmployeeListRecord = Prisma.EmployeeGetPayload<{ select: typeof listSelect }>;

/** Ids de empleados cuyo apellido y nombre contiene el texto, sin distinguir mayúsculas ni acentos. */
export async function idsMatchingName(text: string): Promise<string[]> {
  const pattern = `%${text.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM employee
    WHERE immutable_unaccent(lower(last_name || ' ' || first_name)) LIKE immutable_unaccent(${pattern})
       OR immutable_unaccent(lower(first_name || ' ' || last_name)) LIKE immutable_unaccent(${pattern})`;
  return rows.map((r) => r.id);
}

/** Suspensión aprobada que cubre el día: el estado "suspendido" se deriva de ella. */
const suspendedOn = (day: Date): Prisma.LeaveRecordWhereInput => ({
  status: "APROBADA",
  leaveType: { class: "SUSPENSION" },
  startDate: { lte: day },
  endDate: { gte: day },
});

/**
 * Listado paginado. `searchPersonal` habilita la búsqueda por DNI y CUIL
 * (solo para quien puede ver datos personales).
 */
export async function listEmployees(query: EmployeeListQuery, searchPersonal: boolean, today: Date) {
  const or: Prisma.EmployeeWhereInput[] = [];
  if (query.q) {
    const digits = query.q.replace(/[.\-\s]/g, "");
    or.push({ id: { in: await idsMatchingName(query.q) } });
    if (/^\d+$/.test(digits)) {
      if (digits.length <= 9) or.push({ fileNumber: Number(digits) });
      if (searchPersonal) or.push({ dni: { startsWith: digits } }, { cuil: { startsWith: digits } });
    }
  }
  const where: Prisma.EmployeeWhereInput = {
    ...(query.status === "activos"
      ? { status: "ACTIVO" }
      : query.status === "suspendidos"
        ? { status: "ACTIVO", leaveRecords: { some: suspendedOn(today) } }
        : query.status === "egresados"
          ? { status: "EGRESADO" }
          : {}),
    ...(query.departmentId ? { departmentId: query.departmentId } : {}),
    ...(query.workplaceId ? { workplaceId: query.workplaceId } : {}),
    ...(or.length > 0 ? { OR: or } : {}),
  };
  const orderBy: Prisma.EmployeeOrderByWithRelationInput[] =
    query.sort === "legajo"
      ? [{ fileNumber: "asc" }]
      : query.sort === "ingreso"
        ? [{ hireDate: "desc" }, { lastName: "asc" }]
        : [{ lastName: "asc" }, { firstName: "asc" }];

  const [items, total] = await Promise.all([
    db.employee.findMany({
      where,
      select: {
        ...listSelect,
        leaveRecords: { where: suspendedOn(today), select: { endDate: true }, orderBy: { endDate: "desc" }, take: 1 },
      },
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.employee.count({ where }),
  ]);
  return { items, total };
}

export async function findEmployee(id: string, client: Client = db) {
  return client.employee.findUnique({ where: { id }, include: employeeDetailInclude });
}

export async function findBankAccount(employeeId: string, client: Client = db) {
  return client.employeeBankAccount.findUnique({
    where: { employeeId },
    include: { bank: { select: { id: true, name: true, code: true } }, accountType: labeled },
  });
}

export async function nextFileNumber(client: Client): Promise<number> {
  const max = await client.employee.aggregate({ _max: { fileNumber: true } });
  return (max._max.fileNumber ?? 0) + 1;
}

/** Superiores directos hacia arriba, para detectar ciclos (A jefe de B y B jefe de A). */
export async function supervisorChain(startId: string, client: Client): Promise<string[]> {
  const rows = await client.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE chain(id, depth) AS (
      SELECT supervisor_id, 1 FROM employee WHERE id = ${startId}::uuid AND supervisor_id IS NOT NULL
      UNION ALL
      SELECT e.supervisor_id, c.depth + 1 FROM employee e JOIN chain c ON e.id = c.id
      WHERE e.supervisor_id IS NOT NULL AND c.depth < 100
    )
    SELECT id FROM chain`;
  return rows.map((r) => r.id);
}

export async function createEmployee(data: Prisma.EmployeeUncheckedCreateInput, tx: Prisma.TransactionClient) {
  return tx.employee.create({ data, include: employeeDetailInclude });
}

/**
 * Actualiza solo si la versión coincide (bloqueo optimista). Devuelve null si
 * otra persona guardó cambios antes.
 */
export async function updateEmployeeVersioned(
  id: string,
  version: number,
  data: Prisma.EmployeeUncheckedUpdateInput,
  tx: Prisma.TransactionClient,
) {
  const { count } = await tx.employee.updateMany({ where: { id, version }, data: { ...data, version: version + 1 } });
  if (count === 0) return null;
  return tx.employee.findUniqueOrThrow({ where: { id }, include: employeeDetailInclude });
}

export async function touchEmployee(id: string, actorId: string, tx: Prisma.TransactionClient) {
  await tx.employee.update({ where: { id }, data: { version: { increment: 1 }, updatedById: actorId } });
}

export async function upsertBankAccount(
  employeeId: string,
  data: { bankId: string; cbu: string; alias: string | null; accountTypeId: string },
  actorId: string,
  tx: Prisma.TransactionClient,
) {
  return tx.employeeBankAccount.upsert({
    where: { employeeId },
    create: { employeeId, ...data, createdById: actorId, updatedById: actorId },
    update: { ...data, updatedById: actorId },
  });
}

export async function findBankByCode(code: string, client: Client = db) {
  return client.bank.findUnique({ where: { code }, select: { id: true, name: true, isActive: true } });
}

export async function insertHistory(rows: Prisma.EmployeeChangeHistoryCreateManyInput[], tx: Prisma.TransactionClient) {
  if (rows.length > 0) await tx.employeeChangeHistory.createMany({ data: rows });
}

export async function listHistory(employeeId: string) {
  return db.employeeChangeHistory.findMany({
    where: { employeeId },
    include: { createdBy: { select: { name: true } } },
    orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
  });
}

/** Etiquetas de catálogos por id, para escribir el historial en texto legible. */
export async function labelsFor(ids: { model: RefModel; id: string }[], client: Client) {
  const result = new Map<string, string>();
  const byModel = new Map<RefModel, string[]>();
  for (const { model, id } of ids) byModel.set(model, [...(byModel.get(model) ?? []), id]);
  for (const [model, list] of byModel) {
    for (const row of await REF_LOADERS[model](client, list)) result.set(row.id, row.label);
  }
  return result;
}

export type RefModel =
  | "department"
  | "position"
  | "category"
  | "agreement"
  | "contractType"
  | "workdayType"
  | "workSchedule"
  | "lookup"
  | "workplace"
  | "employee";

type Loader = (client: Client, ids: string[]) => Promise<{ id: string; label: string }[]>;
const byName =
  (fn: (client: Client, ids: string[]) => Promise<{ id: string; name: string }[]>): Loader =>
  async (client, ids) =>
    (await fn(client, ids)).map((r) => ({ id: r.id, label: r.name }));
const where = (ids: string[]) => ({ where: { id: { in: ids } }, select: { id: true, name: true } });

const REF_LOADERS: Record<RefModel, Loader> = {
  department: byName((c, ids) => c.department.findMany(where(ids))),
  position: byName((c, ids) => c.position.findMany(where(ids))),
  category: byName((c, ids) => c.category.findMany(where(ids))),
  agreement: byName((c, ids) => c.collectiveAgreement.findMany(where(ids))),
  contractType: byName((c, ids) => c.contractType.findMany(where(ids))),
  workdayType: byName((c, ids) => c.workdayType.findMany(where(ids))),
  workSchedule: byName((c, ids) => c.workSchedule.findMany(where(ids))),
  workplace: byName((c, ids) => c.workplace.findMany(where(ids))),
  lookup: async (c, ids) =>
    (await c.lookupValue.findMany({ where: { id: { in: ids } }, select: { id: true, label: true } })).map((r) => r),
  employee: async (c, ids) =>
    (
      await c.employee.findMany({
        where: { id: { in: ids } },
        select: { id: true, lastName: true, firstName: true, fileNumber: true },
      })
    ).map((e) => ({ id: e.id, label: `${e.lastName}, ${e.firstName} (legajo ${e.fileNumber})` })),
};

/** Opciones de superior directo: empleados activos. */
export async function listSupervisorOptions(includeIds: string[]) {
  const rows = await db.employee.findMany({
    where: { OR: [{ status: "ACTIVO" }, { id: { in: includeIds } }] },
    select: { id: true, lastName: true, firstName: true, fileNumber: true, status: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  return rows.map((e) => ({
    id: e.id,
    label: `${e.lastName}, ${e.firstName} (${e.fileNumber})`,
    isActive: e.status === "ACTIVO",
  }));
}

export async function scheduleOptions(includeIds: string[]) {
  const rows = await db.workSchedule.findMany({
    where: { OR: [{ isActive: true }, { id: { in: includeIds } }] },
    select: { id: true, name: true, isActive: true },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({ id: r.id, label: r.name, isActive: r.isActive }));
}

/** Relaciones entre catálogos que el formulario usa para ayudar al cargar. */
export async function formMetadata() {
  const [contractTypes, categories, positions, company] = await Promise.all([
    db.contractType.findMany({ where: { hasEndDate: true }, select: { id: true } }),
    db.category.findMany({ select: { id: true, agreementId: true } }),
    db.position.findMany({ select: { id: true, departmentId: true } }),
    db.company.findFirst({ select: { defaultArtProviderId: true, defaultWorkplaceId: true } }),
  ]);
  return {
    companyDefaults: {
      artProviderId: company?.defaultArtProviderId ?? "",
      workplaceId: company?.defaultWorkplaceId ?? "",
    },
    contractTypesWithEndDate: contractTypes.map((c) => c.id),
    categoryAgreement: Object.fromEntries(categories.map((c) => [c.id, c.agreementId])),
    positionDepartment: Object.fromEntries(positions.map((p) => [p.id, p.departmentId])),
  };
}

export function transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return db.$transaction(fn);
}

export async function listActiveBanks() {
  return db.bank.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { code: true, name: true } });
}

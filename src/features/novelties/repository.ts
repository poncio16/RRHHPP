import "server-only";
import { idsMatchingName } from "@/features/employees/repository";
import type { NoveltyOrigin, Prisma } from "@/generated/prisma/client";
import { parsePeriod } from "@/lib/format";
import { db } from "@/server/db";
import type { NoveltyFilter, NoveltyListQuery } from "./schemas";

type Client = Prisma.TransactionClient | typeof db;

export const noveltyInclude = {
  employee: { select: { id: true, fileNumber: true, lastName: true, firstName: true } },
  noveltyType: { select: { id: true, name: true, nature: true, quantityUnit: true } },
  createdBy: { select: { name: true } },
} satisfies Prisma.NoveltyInclude;

export type NoveltyRow = Prisma.NoveltyGetPayload<{ include: typeof noveltyInclude }>;

export async function findEmployee(id: string, client: Client = db) {
  return client.employee.findUnique({
    where: { id },
    select: { id: true, lastName: true, firstName: true, hireDate: true, exitDate: true },
  });
}

export async function findNovelty(id: string, client: Client = db) {
  return client.novelty.findUnique({ where: { id }, include: noveltyInclude });
}

export async function findType(id: string, client: Client = db) {
  return client.noveltyType.findUnique({ where: { id } });
}

export async function listTypeOptions(includeIds: string[] = []) {
  return db.noveltyType.findMany({
    where: { OR: [{ isActive: true }, { id: { in: includeIds } }] },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      nature: true,
      requiresAmount: true,
      requiresQuantity: true,
      quantityUnit: true,
      isActive: true,
    },
  });
}

/* ----------------------------------------------------------------------------
 * Listados
 * ------------------------------------------------------------------------- */

const STATUS_FILTER: Record<NoveltyFilter, Prisma.NoveltyWhereInput> = {
  vigentes: { status: { not: "ANULADA" } },
  pendientes: { status: "PENDIENTE" },
  aprobadas: { status: "APROBADA" },
  informadas: { status: "INFORMADA" },
  anuladas: { status: "ANULADA" },
  todas: {},
};

type FilterInput = Pick<NoveltyListQuery, "q" | "estado" | "tipo" | "origen" | "sector"> & { periodo?: string };

export async function noveltyWhere(query: FilterInput, employeeId?: string): Promise<Prisma.NoveltyWhereInput> {
  const and: Prisma.NoveltyWhereInput[] = [STATUS_FILTER[query.estado]];
  if (employeeId) and.push({ employeeId });
  const period = query.periodo ? parsePeriod(query.periodo) : null;
  if (period) and.push({ period });
  if (query.tipo) and.push({ noveltyTypeId: query.tipo });
  if (query.origen) and.push({ sourceType: query.origen === "generadas" ? { not: null } : null });
  if (query.sector) and.push({ employee: { departmentId: query.sector } });
  if (query.q) {
    and.push(
      /^\d{1,9}$/.test(query.q)
        ? { employee: { fileNumber: Number(query.q) } }
        : { employeeId: { in: await idsMatchingName(query.q) } },
    );
  }
  return { AND: and };
}

/**
 * `includeSalary: false` deja afuera de los totales los cambios de básico
 * generados, que son datos salariales.
 */
export async function listNovelties(
  query: NoveltyListQuery,
  { employeeId, includeSalary }: { employeeId?: string; includeSalary: boolean },
) {
  const where = await noveltyWhere(query, employeeId);
  // Totales del filtro sin tener en cuenta el estado elegido (para los contadores de estado).
  const anyStatus = await noveltyWhere({ ...query, estado: "todas" }, employeeId);
  const [items, total, byStatus, amounts] = await Promise.all([
    db.novelty.findMany({
      where,
      orderBy: employeeId
        ? [{ period: "desc" }, { date: "desc" }, { createdAt: "desc" }]
        : [{ employee: { lastName: "asc" } }, { employee: { firstName: "asc" } }, { date: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: noveltyInclude,
    }),
    db.novelty.count({ where }),
    db.novelty.groupBy({ by: ["status"], where: anyStatus, _count: { _all: true } }),
    db.novelty.groupBy({
      by: ["noveltyTypeId"],
      where: {
        AND: [
          where,
          { status: { not: "ANULADA" } },
          { amount: { not: null } },
          ...(includeSalary ? [] : [{ OR: [{ sourceType: null }, { sourceType: { not: "SALARY_HISTORY" } }] }]),
        ],
      },
      _sum: { amount: true },
    }),
  ]);
  const natures = new Map(
    (
      await db.noveltyType.findMany({
        where: { id: { in: amounts.map((a) => a.noveltyTypeId) } },
        select: { id: true, nature: true },
      })
    ).map((t) => [t.id, t.nature]),
  );
  return {
    items,
    total,
    byStatus: byStatus.map((s) => ({ status: s.status, count: s._count._all })),
    amounts: amounts.map((a) => ({ nature: natures.get(a.noveltyTypeId)!, amount: a._sum.amount })),
  };
}

export async function listDepartments() {
  return db.department.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
}

export async function listEmployeeOptions() {
  const rows = await db.employee.findMany({
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, fileNumber: true, lastName: true, firstName: true, status: true },
  });
  return rows.map((e) => ({
    id: e.id,
    label: `${e.lastName}, ${e.firstName} (${e.fileNumber})${e.status === "EGRESADO" ? " · egresado" : ""}`,
  }));
}

/* ----------------------------------------------------------------------------
 * Escritura
 * ------------------------------------------------------------------------- */

export async function createNovelty(data: Prisma.NoveltyUncheckedCreateInput, tx: Prisma.TransactionClient) {
  return tx.novelty.create({ data, include: noveltyInclude });
}

/** Actualiza si el estado sigue siendo uno de `statuses` y (si se indica) nadie la modificó desde `version`. */
export async function updateGuarded(
  id: string,
  guard: { statuses: NoveltyRow["status"][]; version?: Date },
  data: Prisma.NoveltyUncheckedUpdateManyInput,
  tx: Prisma.TransactionClient,
) {
  const { count } = await tx.novelty.updateMany({
    where: { id, status: { in: guard.statuses }, ...(guard.version ? { updatedAt: guard.version } : {}) },
    data,
  });
  return count === 1;
}

/** Ids de las novedades del filtro en un estado, bloqueadas para cambiarlas en lote. */
export async function idsForBulk(where: Prisma.NoveltyWhereInput, tx: Prisma.TransactionClient) {
  const rows = await tx.novelty.findMany({ where, select: { id: true }, orderBy: { id: "asc" } });
  return rows.map((r) => r.id);
}

export async function updateManyStatus(
  ids: string[],
  from: NoveltyRow["status"],
  data: Prisma.NoveltyUncheckedUpdateManyInput,
  tx: Prisma.TransactionClient,
) {
  const { count } = await tx.novelty.updateMany({ where: { id: { in: ids }, status: from }, data });
  return count;
}

export function transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return db.$transaction(fn);
}

/* ----------------------------------------------------------------------------
 * Orígenes de la generación
 * ------------------------------------------------------------------------- */

/** Tipo de novedad activo configurado para cada hecho. */
export async function typesByOrigin(client: Client = db) {
  const rows = await client.noveltyType.findMany({
    where: { generatedFrom: { not: null }, isActive: true },
    select: { id: true, name: true, generatedFrom: true },
  });
  return new Map(rows.map((r) => [r.generatedFrom as NoveltyOrigin, { id: r.id, name: r.name }]));
}

export async function generatedInPeriod(period: Date, client: Client = db) {
  return client.novelty.findMany({ where: { period, sourceType: { not: null } } });
}

/** Licencias aprobadas del período cuyo tipo genera una novedad (activa). */
export async function leavesForPeriod(start: Date, end: Date, client: Client = db) {
  return client.leaveRecord.findMany({
    where: {
      status: "APROBADA",
      startDate: { lte: end },
      endDate: { gte: start },
      leaveType: { generatesNoveltyType: { isActive: true } },
    },
    select: {
      id: true,
      employeeId: true,
      startDate: true,
      endDate: true,
      leaveType: { select: { class: true, countingMode: true, generatesNoveltyTypeId: true } },
      employee: { select: { workSchedule: { select: { days: { select: { dayOfWeek: true } } } } } },
    },
  });
}

export async function attendanceForPeriod(start: Date, end: Date, client: Client = db) {
  return client.attendanceDay.findMany({
    where: {
      date: { gte: start, lte: end },
      OR: [{ extraMinutes: { gt: 0 } }, { lateMinutes: { gt: 0 } }, { status: "AUSENTE" }],
    },
    orderBy: { date: "asc" },
    select: { employeeId: true, date: true, extraMinutes: true, lateMinutes: true, status: true },
  });
}

export async function salaryChangesForPeriod(start: Date, end: Date, client: Client = db) {
  const rows = await client.salaryHistory.findMany({
    where: { effectiveDate: { gte: start, lte: end } },
    select: { id: true, employeeId: true, effectiveDate: true, basicSalary: true },
  });
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      previous: await client.salaryHistory.findFirst({
        where: { employeeId: row.employeeId, effectiveDate: { lt: row.effectiveDate } },
        orderBy: { effectiveDate: "desc" },
        select: { basicSalary: true },
      }),
    })),
  );
}

export async function categoryChangesForPeriod(start: Date, end: Date, client: Client = db) {
  return client.employeeChangeHistory.findMany({
    where: { changeType: "CATEGORIA", effectiveDate: { gte: start, lte: end } },
    orderBy: { createdAt: "asc" },
    select: { changeSetId: true, employeeId: true, effectiveDate: true, oldValue: true, newValue: true },
  });
}

export async function employeeNames(ids: string[], client: Client = db) {
  const rows = await client.employee.findMany({
    where: { id: { in: ids } },
    select: { id: true, lastName: true, firstName: true, fileNumber: true },
  });
  return new Map(rows.map((r) => [r.id, r]));
}

export async function typeNames(ids: string[], client: Client = db) {
  const rows = await client.noveltyType.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** Todas las novedades del filtro, para exportar. */
export async function listNoveltiesForExport(query: NoveltyListQuery, limit: number) {
  return db.novelty.findMany({
    where: await noveltyWhere(query),
    orderBy: [{ employee: { lastName: "asc" } }, { employee: { firstName: "asc" } }, { date: "asc" }],
    take: limit,
    include: noveltyInclude,
  });
}

/* ----------------------------------------------------------------------------
 * Planilla para el contador
 * ------------------------------------------------------------------------- */

/** Estados que van a la planilla: las pendientes todavía no se aprobaron y las anuladas no corren. */
export const SHEET_STATUSES = ["APROBADA", "INFORMADA"] as const;

/**
 * Tipos con columna en la planilla, en su orden. Uno inactivo sigue
 * apareciendo en los períodos en que tiene novedades.
 */
export async function sheetTypes(period: Date) {
  return db.noveltyType.findMany({
    where: {
      sheetColumn: { not: null },
      OR: [{ isActive: true }, { novelties: { some: { period, status: { in: [...SHEET_STATUSES] } } } }],
    },
    orderBy: [{ sheetColumn: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      requiresAmount: true,
      requiresQuantity: true,
      quantityUnit: true,
      _count: { select: { leaveTypes: true } },
    },
  });
}

/**
 * Empleados con relación laboral en algún día del período (o con novedades
 * de la planilla en él), por legajo.
 */
export async function sheetEmployees(
  filters: { q?: string; sector?: string },
  period: { start: Date; end: Date; typeIds: string[] },
  limit: number,
) {
  const and: Prisma.EmployeeWhereInput[] = [
    {
      OR: [
        { hireDate: { lte: period.end }, OR: [{ exitDate: null }, { exitDate: { gte: period.start } }] },
        {
          novelties: {
            some: {
              period: period.start,
              status: { in: [...SHEET_STATUSES] },
              noveltyTypeId: { in: period.typeIds },
            },
          },
        },
      ],
    },
  ];
  if (filters.sector) and.push({ departmentId: filters.sector });
  if (filters.q) {
    and.push(
      /^\d{1,9}$/.test(filters.q)
        ? { fileNumber: Number(filters.q) }
        : { id: { in: await idsMatchingName(filters.q) } },
    );
  }
  return db.employee.findMany({
    where: { AND: and },
    orderBy: { fileNumber: "asc" },
    take: limit,
    select: {
      id: true,
      fileNumber: true,
      lastName: true,
      firstName: true,
      cuil: true,
      hireDate: true,
      categoryId: true,
      workdayTypeId: true,
      workScheduleId: true,
    },
  });
}

/** Campos del legajo que la planilla muestra como estaban al cierre del mes. */
export const SHEET_ASSIGNMENT_FIELDS = ["categoryId", "workdayTypeId", "workScheduleId"] as const;

/**
 * Cambios de categoría, jornada y horario con fecha efectiva posterior a
 * `end`, del más antiguo al más nuevo: el valor anterior del primero de cada
 * campo es el que regía ese día.
 */
export async function assignmentChangesAfter(employeeIds: string[], end: Date) {
  return db.employeeChangeHistory.findMany({
    where: { employeeId: { in: employeeIds }, field: { in: [...SHEET_ASSIGNMENT_FIELDS] }, effectiveDate: { gt: end } },
    orderBy: [{ effectiveDate: "asc" }, { createdAt: "asc" }],
    select: { employeeId: true, field: true, oldRefId: true },
  });
}

/** Nombre de las categorías y horas semanales de jornadas y horarios, también los inactivos. */
export async function assignmentLabels(ids: { categories: string[]; workdayTypes: string[]; schedules: string[] }) {
  const [categories, workdayTypes, schedules] = await Promise.all([
    db.category.findMany({ where: { id: { in: ids.categories } }, select: { id: true, name: true } }),
    db.workdayType.findMany({ where: { id: { in: ids.workdayTypes } }, select: { id: true, weeklyHours: true } }),
    db.workSchedule.findMany({ where: { id: { in: ids.schedules } }, select: { id: true, weeklyHours: true } }),
  ]);
  return {
    categories: new Map(categories.map((c) => [c.id, c.name])),
    workdayTypes: new Map(workdayTypes.map((w) => [w.id, w.weeklyHours])),
    schedules: new Map(schedules.map((w) => [w.id, w.weeklyHours])),
  };
}

export async function sheetNovelties(period: Date, typeIds: string[], employeeIds: string[]) {
  return db.novelty.findMany({
    where: {
      period,
      status: { in: [...SHEET_STATUSES] },
      noveltyTypeId: { in: typeIds },
      employeeId: { in: employeeIds },
    },
    select: { employeeId: true, noveltyTypeId: true, quantity: true, amount: true, sourceType: true },
  });
}

/** Pendientes de aprobar de los tipos y empleados de la planilla: no entran y se avisa. */
export async function countSheetPending(period: Date, typeIds: string[], employeeIds: string[]) {
  return db.novelty.count({
    where: { period, status: "PENDIENTE", noveltyTypeId: { in: typeIds }, employeeId: { in: employeeIds } },
  });
}

export async function findDepartmentName(id: string) {
  return (await db.department.findUnique({ where: { id }, select: { name: true } }))?.name ?? null;
}

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

export async function listNovelties(query: NoveltyListQuery, employeeId?: string) {
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
      where: { AND: [where, { status: { not: "ANULADA" } }, { amount: { not: null } }] },
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

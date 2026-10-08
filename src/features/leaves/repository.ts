import "server-only";
import { idsMatchingName } from "@/features/employees/repository";
import type { Prisma } from "@/generated/prisma/client";
import { parseIsoDate } from "@/lib/format";
import { db } from "@/server/db";
import type { LeaveClass, LeaveStatus } from "./constants";
import type { LeaveListQuery } from "./schemas";

type Client = Prisma.TransactionClient | typeof db;

export const leaveTypeSelect = {
  id: true,
  name: true,
  class: true,
  countingMode: true,
  isPaid: true,
  isSensitive: true,
  isActive: true,
  requiresCertificate: true,
  maxDaysPerEvent: true,
  maxDaysPerYear: true,
} satisfies Prisma.LeaveTypeSelect;

export type LeaveTypeRecord = Prisma.LeaveTypeGetPayload<{ select: typeof leaveTypeSelect }>;

const userName = { select: { id: true, name: true } } as const;

export const leaveInclude = {
  leaveType: { select: leaveTypeSelect },
  employee: { select: { id: true, fileNumber: true, lastName: true, firstName: true, status: true } },
  vacationBalance: { select: { id: true, year: true } },
  requestedBy: userName,
  decidedBy: userName,
  documents: {
    where: { status: { not: "ANULADO" } },
    select: { id: true, documentType: { select: { isSensitive: true } } },
  },
} satisfies Prisma.LeaveRecordInclude;

export type LeaveRecordRow = Prisma.LeaveRecordGetPayload<{ include: typeof leaveInclude }>;

const STATUS_WHERE: Record<LeaveListQuery["status"], Prisma.LeaveRecordWhereInput> = {
  vigentes: { status: { in: ["SOLICITADA", "APROBADA"] } },
  pendientes: { status: "SOLICITADA" },
  aprobadas: { status: "APROBADA" },
  rechazadas: { status: "RECHAZADA" },
  anuladas: { status: "ANULADA" },
  todas: {},
};

const CLASS_FILTER: Record<NonNullable<LeaveListQuery["class"]>, LeaveClass> = {
  licencias: "LICENCIA",
  ausencias: "AUSENCIA",
  vacaciones: "VACACIONES",
  suspensiones: "SUSPENSION",
};

export async function listLeaves(
  query: LeaveListQuery,
  scope: { employeeId?: string; onlyClass?: LeaveClass; includeSensitive: boolean; today: Date },
) {
  const and: Prisma.LeaveRecordWhereInput[] = [STATUS_WHERE[query.status]];
  if (scope.employeeId) and.push({ employeeId: scope.employeeId });
  const leaveClass = scope.onlyClass ?? (query.class ? CLASS_FILTER[query.class] : undefined);
  if (leaveClass) and.push({ leaveType: { class: leaveClass } });
  if (query.leaveTypeId) {
    and.push({ leaveTypeId: query.leaveTypeId });
    // Sin permiso, filtrar por un tipo sensible no revela qué registros lo son.
    if (!scope.includeSensitive) and.push({ leaveType: { isSensitive: false } });
  }
  if (query.q && !scope.employeeId) {
    const q = query.q;
    and.push(
      /^\d{1,9}$/.test(q) ? { employee: { fileNumber: Number(q) } } : { employeeId: { in: await idsMatchingName(q) } },
    );
  }
  if (query.timing === "en-curso") and.push({ startDate: { lte: scope.today }, endDate: { gte: scope.today } });
  if (query.timing === "proximas") and.push({ startDate: { gt: scope.today } });
  if (query.timing === "finalizadas") and.push({ endDate: { lt: scope.today } });
  if (query.desde) and.push({ endDate: { gte: parseIsoDate(query.desde)! } });
  if (query.hasta) and.push({ startDate: { lte: parseIsoDate(query.hasta)! } });

  const orderBy: Prisma.LeaveRecordOrderByWithRelationInput[] =
    query.sort === "empleado"
      ? [{ employee: { lastName: "asc" } }, { employee: { firstName: "asc" } }, { startDate: "desc" }]
      : query.sort === "inicio"
        ? [{ startDate: "asc" }, { createdAt: "asc" }]
        : [{ startDate: "desc" }, { createdAt: "desc" }];

  const where = { AND: and };
  const [items, total] = await Promise.all([
    db.leaveRecord.findMany({
      where,
      include: leaveInclude,
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.leaveRecord.count({ where }),
  ]);
  return { items, total };
}

export async function findLeave(id: string, client: Client = db) {
  return client.leaveRecord.findUnique({ where: { id }, include: leaveInclude });
}

export async function findLeaveType(id: string, client: Client = db) {
  return client.leaveType.findUnique({ where: { id }, select: leaveTypeSelect });
}

/** Tipos activos más los ya asignados; sin los sensibles si el usuario no puede verlos. */
export async function listTypeOptions(includeSensitive: boolean, includeIds: string[] = []) {
  return db.leaveType.findMany({
    where: {
      OR: [{ isActive: true }, { id: { in: includeIds } }],
      ...(includeSensitive ? {} : { isSensitive: false }),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: leaveTypeSelect,
  });
}

export async function listEmployeeOptions() {
  const rows = await db.employee.findMany({
    where: { status: { not: "EGRESADO" } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, fileNumber: true, lastName: true, firstName: true },
  });
  return rows.map((e) => ({ id: e.id, label: `${e.lastName}, ${e.firstName} (${e.fileNumber})` }));
}

/** Datos del empleado que hacen falta para validar y contar días. */
export async function findEmployeeForLeave(id: string, client: Client = db) {
  return client.employee.findUnique({
    where: { id },
    select: {
      id: true,
      fileNumber: true,
      lastName: true,
      firstName: true,
      status: true,
      hireDate: true,
      exitDate: true,
      workSchedule: { select: { days: { select: { dayOfWeek: true } } } },
    },
  });
}

export type EmployeeForLeave = NonNullable<Awaited<ReturnType<typeof findEmployeeForLeave>>>;

/**
 * Bloquea la fila del empleado hasta el fin de la transacción: dos altas o
 * aprobaciones simultáneas del mismo empleado no pueden saltear el control
 * de solapamientos ni de saldo.
 */
export async function lockEmployee(id: string, tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT id FROM employee WHERE id = ${id}::uuid FOR UPDATE`;
}

/** Registros del empleado en esos estados que comparten algún día con el período. */
export async function findOverlapping(
  employeeId: string,
  start: Date,
  end: Date,
  statuses: LeaveStatus[],
  excludeId: string | null,
  client: Client = db,
) {
  return client.leaveRecord.findFirst({
    where: {
      employeeId,
      status: { in: statuses },
      startDate: { lte: end },
      endDate: { gte: start },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    orderBy: { startDate: "asc" },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      status: true,
      leaveType: { select: { name: true, isSensitive: true } },
    },
  });
}

/** Días aprobados de un tipo para el empleado con inicio en el año calendario. */
export async function approvedDaysInYear(
  employeeId: string,
  leaveTypeId: string,
  year: number,
  excludeId: string | null,
  client: Client = db,
) {
  const result = await client.leaveRecord.aggregate({
    where: {
      employeeId,
      leaveTypeId,
      status: "APROBADA",
      startDate: { gte: new Date(Date.UTC(year, 0, 1)), lte: new Date(Date.UTC(year, 11, 31)) },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    _sum: { days: true },
  });
  return result._sum.days ?? 0;
}

/** Feriados (no los optativos) entre dos fechas, como claves AAAA-MM-DD. */
export async function holidaysBetween(start: Date, end: Date, client: Client = db): Promise<Set<string>> {
  const rows = await client.holiday.findMany({
    where: { date: { gte: start, lte: end }, isNonWorkingOptional: false },
    select: { date: true },
  });
  return new Set(rows.map((r) => r.date.toISOString().slice(0, 10)));
}

export async function findBalance(id: string, client: Client = db) {
  return client.vacationBalance.findUnique({ where: { id } });
}

/** Días usados (aprobados) y solicitados de cada período, sin contar `excludeId`. */
export async function balanceUsage(balanceIds: string[], excludeId: string | null = null, client: Client = db) {
  const rows = await client.leaveRecord.groupBy({
    by: ["vacationBalanceId", "status"],
    where: {
      vacationBalanceId: { in: balanceIds },
      status: { in: ["SOLICITADA", "APROBADA"] },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    _sum: { days: true },
  });
  const usage = new Map<string, { used: number; requested: number }>();
  for (const id of balanceIds) usage.set(id, { used: 0, requested: 0 });
  for (const row of rows) {
    const entry = usage.get(row.vacationBalanceId!)!;
    if (row.status === "APROBADA") entry.used += row._sum.days ?? 0;
    else entry.requested += row._sum.days ?? 0;
  }
  return usage;
}

export async function listEmployeeBalances(employeeId: string, client: Client = db) {
  return client.vacationBalance.findMany({ where: { employeeId }, orderBy: { year: "asc" } });
}

/** Suspensión aprobada que cubre el día (el estado "suspendido" se deriva, no se guarda). */
export async function findActiveSuspension(employeeId: string, day: Date) {
  return db.leaveRecord.findFirst({
    where: {
      employeeId,
      status: "APROBADA",
      leaveType: { class: "SUSPENSION" },
      startDate: { lte: day },
      endDate: { gte: day },
    },
    orderBy: { endDate: "desc" },
    select: { id: true, startDate: true, endDate: true },
  });
}

export async function createLeave(data: Prisma.LeaveRecordUncheckedCreateInput, tx: Prisma.TransactionClient) {
  return tx.leaveRecord.create({ data });
}

/** Actualiza solo si nadie lo modificó desde `updatedAt`; devuelve false si hubo otro cambio. */
export async function updateLeaveVersioned(
  id: string,
  updatedAt: Date,
  data: Prisma.LeaveRecordUncheckedUpdateManyInput,
  tx: Prisma.TransactionClient,
) {
  const result = await tx.leaveRecord.updateMany({ where: { id, updatedAt }, data });
  return result.count === 1;
}

export function transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return db.$transaction(fn);
}

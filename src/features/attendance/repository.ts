import "server-only";
import { idsMatchingName } from "@/features/employees/repository";
import type { Prisma } from "@/generated/prisma/client";
import { parseIsoDate } from "@/lib/format";
import { db } from "@/server/db";
import type { AttendanceListQuery } from "./schemas";

type Client = Prisma.TransactionClient | typeof db;

const scheduleSelect = {
  select: { days: { select: { dayOfWeek: true, startTime: true, endTime: true, breakMinutes: true } } },
} as const;

/** Datos del empleado que hacen falta para calcular un día de asistencia. */
export const employeeSelect = {
  id: true,
  fileNumber: true,
  lastName: true,
  firstName: true,
  status: true,
  hireDate: true,
  exitDate: true,
  department: { select: { id: true, name: true } },
  workSchedule: scheduleSelect,
} satisfies Prisma.EmployeeSelect;

export type AttendanceEmployee = Prisma.EmployeeGetPayload<{ select: typeof employeeSelect }>;

export const recordInclude = {
  employee: { select: { id: true, fileNumber: true, lastName: true, firstName: true, status: true } },
  leaveRecord: { select: { id: true, leaveType: { select: { name: true, isSensitive: true } } } },
} satisfies Prisma.AttendanceDayInclude;

export type AttendanceRow = Prisma.AttendanceDayGetPayload<{ include: typeof recordInclude }>;

export async function findEmployee(id: string, client: Client = db) {
  return client.employee.findUnique({ where: { id }, select: employeeSelect });
}

/** Personal con relación laboral ese día (ingresado y sin egreso anterior), opcionalmente de un sector. */
export async function employeesOn(date: Date, filter: { departmentId?: string; q?: string }, client: Client = db) {
  const and: Prisma.EmployeeWhereInput[] = [
    { hireDate: { lte: date } },
    { OR: [{ exitDate: null }, { exitDate: { gte: date } }] },
  ];
  if (filter.departmentId) and.push({ departmentId: filter.departmentId });
  if (filter.q) {
    and.push(
      /^\d{1,9}$/.test(filter.q) ? { fileNumber: Number(filter.q) } : { id: { in: await idsMatchingName(filter.q) } },
    );
  }
  return client.employee.findMany({
    where: { AND: and },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: employeeSelect,
  });
}

export async function employeesByIds(ids: string[], client: Client = db) {
  return client.employee.findMany({ where: { id: { in: ids } }, select: employeeSelect });
}

export async function daysOn(employeeIds: string[], date: Date, client: Client = db) {
  return client.attendanceDay.findMany({ where: { employeeId: { in: employeeIds }, date }, include: recordInclude });
}

export async function findDay(employeeId: string, date: Date, client: Client = db) {
  return client.attendanceDay.findUnique({
    where: { employeeId_date: { employeeId, date } },
    include: recordInclude,
  });
}

/** Feriados del período con su nombre; los no laborables optativos cuentan como días hábiles. */
export async function holidaysBetween(start: Date, end: Date, client: Client = db) {
  const rows = await client.holiday.findMany({
    where: { date: { gte: start, lte: end }, isNonWorkingOptional: false },
    select: { date: true, name: true },
  });
  return new Map(rows.map((r) => [r.date.toISOString().slice(0, 10), { name: r.name }]));
}

/** Licencias, ausencias, vacaciones y suspensiones aprobadas que comparten días con el período. */
export async function approvedLeavesBetween(employeeIds: string[], start: Date, end: Date, client: Client = db) {
  return client.leaveRecord.findMany({
    where: { employeeId: { in: employeeIds }, status: "APROBADA", startDate: { lte: end }, endDate: { gte: start } },
    select: {
      id: true,
      employeeId: true,
      startDate: true,
      endDate: true,
      leaveType: { select: { name: true, isSensitive: true } },
    },
  });
}

export type CoveringLeave = Awaited<ReturnType<typeof approvedLeavesBetween>>[number];

/** Días con fichada del empleado en el período (no pueden quedar cubiertos por una licencia). */
export async function presenceBetween(employeeId: string, start: Date, end: Date, client: Client = db) {
  return client.attendanceDay.findMany({
    where: { employeeId, status: "PRESENTE", date: { gte: start, lte: end } },
    orderBy: { date: "asc" },
    select: { date: true },
  });
}

/** Días cargados sin fichada del empleado en el período. */
export async function daysWithoutTimesBetween(employeeId: string, start: Date, end: Date, client: Client = db) {
  return client.attendanceDay.findMany({
    where: { employeeId, checkIn: null, date: { gte: start, lte: end } },
    select: { id: true, date: true, status: true, leaveRecordId: true },
  });
}

function listWhere(query: AttendanceListQuery, employeeId?: string): Prisma.AttendanceDayWhereInput[] {
  const and: Prisma.AttendanceDayWhereInput[] = [];
  if (employeeId) and.push({ employeeId });
  if (query.desde) and.push({ date: { gte: parseIsoDate(query.desde)! } });
  if (query.hasta) and.push({ date: { lte: parseIsoDate(query.hasta)! } });
  if (query.sector) and.push({ employee: { departmentId: query.sector } });
  switch (query.estado) {
    case "presentes":
      and.push({ status: "PRESENTE" });
      break;
    case "ausentes":
      and.push({ status: "AUSENTE" });
      break;
    case "tarde":
      and.push({ lateMinutes: { gt: 0 } });
      break;
    case "adicionales":
      and.push({ extraMinutes: { gt: 0 } });
      break;
    case "licencia":
      and.push({ status: "JUSTIFICADO" });
      break;
    case "descanso":
      and.push({ status: { in: ["FRANCO", "FERIADO"] } });
      break;
  }
  return and;
}

/** Listado paginado con totales del conjunto filtrado. */
export async function listDays(query: AttendanceListQuery, employeeId?: string) {
  const and = listWhere(query, employeeId);
  if (query.q && !employeeId) {
    const q = query.q;
    and.push(
      /^\d{1,9}$/.test(q) ? { employee: { fileNumber: Number(q) } } : { employeeId: { in: await idsMatchingName(q) } },
    );
  }
  const where = { AND: and };
  const orderBy: Prisma.AttendanceDayOrderByWithRelationInput[] =
    query.sort === "empleado"
      ? [{ employee: { lastName: "asc" } }, { employee: { firstName: "asc" } }, { date: "desc" }]
      : [{ date: "desc" }, { employee: { lastName: "asc" } }, { employee: { firstName: "asc" } }];
  const [items, total, sums, byStatus, lateDays] = await Promise.all([
    db.attendanceDay.findMany({
      where,
      include: recordInclude,
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.attendanceDay.count({ where }),
    db.attendanceDay.aggregate({
      where,
      _sum: { workedMinutes: true, regularMinutes: true, extraMinutes: true, lateMinutes: true },
    }),
    db.attendanceDay.groupBy({ by: ["status"], where, _count: { _all: true } }),
    db.attendanceDay.count({ where: { AND: [...and, { lateMinutes: { gt: 0 } }] } }),
  ]);
  return { items, total, sums: sums._sum, byStatus, lateDays };
}

export async function listDepartments() {
  return db.department.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
}

export async function createDay(data: Prisma.AttendanceDayUncheckedCreateInput, tx: Prisma.TransactionClient) {
  return tx.attendanceDay.create({ data });
}

/** Actualiza solo si nadie lo modificó desde `updatedAt`; devuelve false si hubo otro cambio. */
export async function updateDayVersioned(
  id: string,
  updatedAt: Date,
  data: Prisma.AttendanceDayUncheckedUpdateManyInput,
  tx: Prisma.TransactionClient,
) {
  const result = await tx.attendanceDay.updateMany({ where: { id, updatedAt }, data });
  return result.count === 1;
}

export async function updateDay(
  id: string,
  data: Prisma.AttendanceDayUncheckedUpdateInput,
  tx: Prisma.TransactionClient,
) {
  return tx.attendanceDay.update({ where: { id }, data });
}

export function transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return db.$transaction(fn);
}

import "server-only";
import { db } from "@/server/db";

const employeeRef = { id: true, fileNumber: true, lastName: true, firstName: true } as const;

export async function headcount() {
  const rows = await db.employee.groupBy({ by: ["status"], _count: { _all: true } });
  return Object.fromEntries(rows.map((r) => [r.status, r._count._all])) as Partial<
    Record<"ACTIVO" | "EGRESADO", number>
  >;
}

/** Personal activo con lo necesario para antigüedad y distribuciones. */
export async function activeEmployees() {
  return db.employee.findMany({
    where: { status: "ACTIVO" },
    select: {
      id: true,
      seniorityDate: true,
      department: { select: { name: true } },
      position: { select: { name: true } },
      contractType: { select: { name: true } },
      workModality: { select: { label: true } },
    },
  });
}

/** Ingresos (o reingresos) con fecha de ingreso en el período. */
export async function hiresBetween(start: Date, end: Date) {
  return db.employee.findMany({
    where: { hireDate: { gte: start, lte: end } },
    select: { ...employeeRef, hireDate: true, position: { select: { name: true } } },
    orderBy: [{ hireDate: "desc" }, { lastName: "asc" }],
  });
}

export async function exitsBetween(start: Date, end: Date) {
  return db.employeeExit.findMany({
    where: { status: "CONFIRMADO", exitDate: { gte: start, lte: end } },
    select: { id: true, exitDate: true, exitType: { select: { label: true } }, employee: { select: employeeRef } },
    orderBy: { exitDate: "desc" },
  });
}

/** Personas que trabajaron en algún día del período, con su horario. */
export async function employeesInPeriod(start: Date, end: Date) {
  return db.employee.findMany({
    where: { hireDate: { lte: end }, OR: [{ exitDate: null }, { exitDate: { gte: start } }] },
    select: {
      id: true,
      hireDate: true,
      exitDate: true,
      workSchedule: { select: { days: { select: { dayOfWeek: true } } } },
    },
  });
}

export async function absentDaysBetween(start: Date, end: Date) {
  return db.attendanceDay.findMany({
    where: { status: "AUSENTE", date: { gte: start, lte: end } },
    select: { employeeId: true, date: true },
  });
}

export async function absenteeismLeavesBetween(start: Date, end: Date) {
  return db.leaveRecord.findMany({
    where: {
      status: "APROBADA",
      leaveType: { countsForAbsenteeism: true },
      startDate: { lte: end },
      endDate: { gte: start },
    },
    select: { employeeId: true, startDate: true, endDate: true },
  });
}

/** Licencias y vacaciones aprobadas de personal activo que cubren el día. */
export async function leavesOn(day: Date) {
  return db.leaveRecord.findMany({
    where: { status: "APROBADA", startDate: { lte: day }, endDate: { gte: day }, employee: { status: "ACTIVO" } },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      employee: { select: employeeRef },
      leaveType: { select: { name: true, class: true, isSensitive: true } },
    },
    orderBy: { endDate: "asc" },
  });
}

/** Períodos de vacaciones de personal activo hasta el año indicado. */
export async function vacationBalancesUpTo(year: number) {
  return db.vacationBalance.findMany({
    where: { year: { lte: year }, employee: { status: "ACTIVO" } },
    select: { id: true, employeeId: true, entitledDays: true, adjustmentDays: true, carriedOverDays: true },
  });
}

import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import type { StructureFilters } from "./schemas";

/** Filtros de estructura sobre la asignación actual (las claves sin valor no filtran). */
const structureWhere = (f: StructureFilters): Prisma.EmployeeWhereInput => ({
  departmentId: f.sector,
  positionId: f.puesto,
  categoryId: f.categoria,
  workplaceId: f.establecimiento,
});

const employeeSelect = {
  id: true,
  fileNumber: true,
  lastName: true,
  firstName: true,
  hireDate: true,
  seniorityDate: true,
  exitDate: true,
  contractEndDate: true,
  status: true,
  department: { select: { name: true } },
  position: { select: { name: true } },
  category: { select: { name: true } },
  workplace: { select: { name: true } },
  contractType: { select: { name: true } },
} satisfies Prisma.EmployeeSelect;

export type ReportEmployee = Prisma.EmployeeGetPayload<{ select: typeof employeeSelect }>;

const byName: Prisma.EmployeeOrderByWithRelationInput[] = [{ lastName: "asc" }, { firstName: "asc" }];

export async function activeEmployees(filters: StructureFilters) {
  return db.employee.findMany({
    where: { status: "ACTIVO", ...structureWhere(filters) },
    select: employeeSelect,
    orderBy: byName,
  });
}

/* ----------------------------------------------------------------------------
 * Altas y bajas
 * ------------------------------------------------------------------------- */

/** Personas con algún período de empleo que toca el rango, con reingresos y egresos confirmados. */
export async function employmentHistory(filters: StructureFilters, until: Date) {
  return db.employee.findMany({
    where: {
      ...structureWhere(filters),
      OR: [{ hireDate: { lte: until } }, { changeHistory: { some: { changeType: "REINGRESO" } } }],
    },
    select: {
      ...employeeSelect,
      changeHistory: {
        where: { changeType: "REINGRESO", field: "hireDate" },
        select: { oldValue: true },
      },
      exits: {
        where: { status: "CONFIRMADO" },
        select: {
          id: true,
          exitDate: true,
          exitType: { select: { label: true } },
          exitReason: { select: { label: true } },
        },
      },
    },
    orderBy: byName,
  });
}

/* ----------------------------------------------------------------------------
 * Ausentismo
 * ------------------------------------------------------------------------- */

export async function employeesInRange(filters: StructureFilters, start: Date, end: Date) {
  return db.employee.findMany({
    where: {
      ...structureWhere(filters),
      hireDate: { lte: end },
      OR: [{ exitDate: null }, { exitDate: { gte: start } }],
    },
    select: { ...employeeSelect, workSchedule: { select: { days: { select: { dayOfWeek: true } } } } },
    orderBy: byName,
  });
}

export async function absentDays(employeeIds: string[], start: Date, end: Date) {
  return db.attendanceDay.findMany({
    where: { employeeId: { in: employeeIds }, status: "AUSENTE", date: { gte: start, lte: end } },
    select: { employeeId: true, date: true },
  });
}

export async function absenteeismLeaves(employeeIds: string[], start: Date, end: Date) {
  return db.leaveRecord.findMany({
    where: {
      employeeId: { in: employeeIds },
      status: "APROBADA",
      leaveType: { countsForAbsenteeism: true },
      startDate: { lte: end },
      endDate: { gte: start },
    },
    select: {
      employeeId: true,
      startDate: true,
      endDate: true,
      leaveType: { select: { name: true, isSensitive: true } },
    },
  });
}

/* ----------------------------------------------------------------------------
 * Vacaciones
 * ------------------------------------------------------------------------- */

export async function vacationBalances(filters: StructureFilters, year: number | null, onlyActive: boolean) {
  return db.vacationBalance.findMany({
    where: {
      ...(year ? { year } : {}),
      employee: { ...structureWhere(filters), ...(onlyActive ? { status: "ACTIVO" } : {}) },
    },
    select: {
      id: true,
      year: true,
      entitledDays: true,
      adjustmentDays: true,
      carriedOverDays: true,
      employee: { select: employeeSelect },
    },
    orderBy: [{ employee: { lastName: "asc" } }, { employee: { firstName: "asc" } }, { year: "asc" }],
  });
}

export async function vacationYears() {
  const rows = await db.vacationBalance.findMany({
    distinct: ["year"],
    select: { year: true },
    orderBy: { year: "desc" },
  });
  return rows.map((r) => r.year);
}

/* ----------------------------------------------------------------------------
 * Vencimientos
 * ------------------------------------------------------------------------- */

export async function expiringDocuments(filters: StructureFilters, start: Date, end: Date) {
  const rows = await db.document.findMany({
    where: {
      status: { not: "ANULADO" },
      expiryDate: { gte: start, lte: end },
      employee: { status: "ACTIVO", ...structureWhere(filters) },
    },
    select: {
      id: true,
      employeeId: true,
      documentTypeId: true,
      expiryDate: true,
      employee: { select: employeeSelect },
      documentType: { select: { name: true, isSensitive: true } },
    },
    orderBy: [{ expiryDate: "asc" }],
  });
  if (rows.length === 0) return [];
  // Renovado: otro documento vigente del mismo tipo vence después (o no vence).
  const later = await db.document.findMany({
    where: {
      status: { not: "ANULADO" },
      OR: rows.map((r) => ({
        employeeId: r.employeeId,
        documentTypeId: r.documentTypeId,
        OR: [{ expiryDate: null }, { expiryDate: { gt: r.expiryDate! } }],
      })),
    },
    select: { employeeId: true, documentTypeId: true, expiryDate: true },
  });
  return rows.map((r) => ({
    ...r,
    renewed: later.some(
      (n) =>
        n.employeeId === r.employeeId &&
        n.documentTypeId === r.documentTypeId &&
        (n.expiryDate === null || n.expiryDate > r.expiryDate!),
    ),
  }));
}

export async function endingLeaves(filters: StructureFilters, start: Date, end: Date) {
  return db.leaveRecord.findMany({
    where: {
      status: "APROBADA",
      endDate: { gte: start, lte: end },
      leaveType: { class: { not: "VACACIONES" } },
      employee: { status: "ACTIVO", ...structureWhere(filters) },
    },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      employee: { select: employeeSelect },
      leaveType: { select: { name: true, isSensitive: true } },
    },
    orderBy: { endDate: "asc" },
  });
}

export async function endingContracts(filters: StructureFilters, start: Date, end: Date) {
  return db.employee.findMany({
    where: { status: "ACTIVO", contractEndDate: { gte: start, lte: end }, ...structureWhere(filters) },
    select: employeeSelect,
    orderBy: { contractEndDate: "asc" },
  });
}

/* ----------------------------------------------------------------------------
 * Remuneraciones informadas
 * ------------------------------------------------------------------------- */

export async function payrollRecords(filters: StructureFilters, period: Date) {
  return db.payrollRecord.findMany({
    where: { period, employee: structureWhere(filters) },
    select: {
      id: true,
      source: true,
      grossReported: true,
      deductionsReported: true,
      netReported: true,
      employee: { select: employeeSelect },
    },
    orderBy: [{ employee: { lastName: "asc" } }, { employee: { firstName: "asc" } }],
  });
}

export async function latestPayrollPeriod() {
  const row = await db.payrollRecord.findFirst({ orderBy: { period: "desc" }, select: { period: true } });
  return row?.period ?? null;
}

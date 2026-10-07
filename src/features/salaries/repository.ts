import "server-only";
import { idsMatchingName } from "@/features/employees/repository";
import type { Prisma } from "@/generated/prisma/client";
import { parsePeriod } from "@/lib/format";
import { db } from "@/server/db";
import type { PayrollListQuery, SalaryListQuery } from "./schemas";

type Client = Prisma.TransactionClient | typeof db;

const employeeSelect = {
  id: true,
  fileNumber: true,
  lastName: true,
  firstName: true,
  status: true,
  hireDate: true,
  exitDate: true,
  department: { select: { id: true, name: true } },
} satisfies Prisma.EmployeeSelect;

export type SalaryEmployee = Prisma.EmployeeGetPayload<{ select: typeof employeeSelect }>;

export async function findEmployee(id: string, client: Client = db) {
  return client.employee.findUnique({ where: { id }, select: employeeSelect });
}

/** Búsqueda por legajo (número) o por nombre, sin acentos. */
async function employeeSearch(q: string): Promise<Prisma.EmployeeWhereInput> {
  return /^\d{1,9}$/.test(q) ? { fileNumber: Number(q) } : { id: { in: await idsMatchingName(q) } };
}

/* ----------------------------------------------------------------------------
 * Historial salarial
 * ------------------------------------------------------------------------- */

const salaryInclude = { createdBy: { select: { name: true } } } satisfies Prisma.SalaryHistoryInclude;
export type SalaryRow = Prisma.SalaryHistoryGetPayload<{ include: typeof salaryInclude }>;

export async function listSalaryHistory(employeeId: string, client: Client = db) {
  return client.salaryHistory.findMany({
    where: { employeeId },
    orderBy: { effectiveDate: "desc" },
    include: salaryInclude,
  });
}

export async function findSalary(id: string, client: Client = db) {
  return client.salaryHistory.findUnique({ where: { id }, include: salaryInclude });
}

export async function findSalaryOn(employeeId: string, effectiveDate: Date, client: Client = db) {
  return client.salaryHistory.findUnique({ where: { employeeId_effectiveDate: { employeeId, effectiveDate } } });
}

export async function createSalary(data: Prisma.SalaryHistoryUncheckedCreateInput, tx: Prisma.TransactionClient) {
  return tx.salaryHistory.create({ data, include: salaryInclude });
}

/** Actualiza solo si nadie lo modificó desde `version` (fecha de modificación leída). */
export async function updateSalaryVersioned(
  id: string,
  version: Date,
  data: Prisma.SalaryHistoryUncheckedUpdateInput,
  tx: Prisma.TransactionClient,
) {
  const { count } = await tx.salaryHistory.updateMany({ where: { id, updatedAt: version }, data });
  return count === 1;
}

/**
 * Básico vigente (el de mayor fecha efectiva hasta `day`) y el anterior a
 * él, de cada empleado indicado.
 */
export async function currentSalaries(employeeIds: string[], day: Date, client: Client = db) {
  if (employeeIds.length === 0) return new Map<string, { current: SalaryRow; previous: SalaryRow | null }>();
  const rows = await client.salaryHistory.findMany({
    where: { employeeId: { in: employeeIds }, effectiveDate: { lte: day } },
    orderBy: [{ employeeId: "asc" }, { effectiveDate: "desc" }],
    include: salaryInclude,
  });
  const result = new Map<string, { current: SalaryRow; previous: SalaryRow | null }>();
  for (const row of rows) {
    const entry = result.get(row.employeeId);
    if (!entry) result.set(row.employeeId, { current: row, previous: null });
    else if (!entry.previous) entry.previous = row;
  }
  return result;
}

/** Empleados con su básico vigente a `day` (listado "Básicos vigentes"). */
export async function listSalaryEmployees(query: SalaryListQuery, day: Date) {
  const and: Prisma.EmployeeWhereInput[] = [];
  if (query.estado !== "todos") and.push({ status: { not: "EGRESADO" } });
  if (query.estado === "sin-basico") and.push({ salaryHistory: { none: { effectiveDate: { lte: day } } } });
  if (query.sector) and.push({ departmentId: query.sector });
  if (query.q) and.push(await employeeSearch(query.q));
  const where: Prisma.EmployeeWhereInput = { AND: and };
  const [items, total, withoutSalary] = await Promise.all([
    db.employee.findMany({
      where,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: { ...employeeSelect, position: { select: { name: true } }, category: { select: { name: true } } },
    }),
    db.employee.count({ where }),
    db.employee.count({
      where: { status: { not: "EGRESADO" }, salaryHistory: { none: { effectiveDate: { lte: day } } } },
    }),
  ]);
  return { items, total, withoutSalary };
}

/* ----------------------------------------------------------------------------
 * Resúmenes informados
 * ------------------------------------------------------------------------- */

export const payrollInclude = {
  employee: { select: { id: true, fileNumber: true, lastName: true, firstName: true } },
  lines: {
    orderBy: { id: "asc" },
    include: { conceptType: { select: { id: true, name: true, nature: true, kind: true } } },
  },
} satisfies Prisma.PayrollRecordInclude;

export type PayrollRow = Prisma.PayrollRecordGetPayload<{ include: typeof payrollInclude }>;

export async function findPayroll(id: string, client: Client = db) {
  return client.payrollRecord.findUnique({ where: { id }, include: payrollInclude });
}

export async function findPayrollFor(employeeId: string, period: Date, client: Client = db) {
  return client.payrollRecord.findUnique({ where: { employeeId_period: { employeeId, period } } });
}

export async function listEmployeePayrolls(employeeId: string, client: Client = db) {
  return client.payrollRecord.findMany({
    where: { employeeId },
    orderBy: { period: "desc" },
    include: payrollInclude,
  });
}

async function payrollWhere(query: PayrollListQuery): Promise<Prisma.PayrollRecordWhereInput> {
  const employee: Prisma.EmployeeWhereInput[] = [];
  if (query.sector) employee.push({ departmentId: query.sector });
  if (query.q) employee.push(await employeeSearch(query.q));
  const period = query.periodo ? parsePeriod(query.periodo) : null;
  return {
    ...(period ? { period } : {}),
    ...(employee.length > 0 ? { employee: { AND: employee } } : {}),
  };
}

/** Todos los resúmenes que coinciden con el filtro (para totales y controles). */
export async function listPayrolls(query: PayrollListQuery) {
  return db.payrollRecord.findMany({
    where: await payrollWhere(query),
    orderBy: [{ period: "desc" }, { employee: { lastName: "asc" } }, { employee: { firstName: "asc" } }],
    include: payrollInclude,
  });
}

/** Períodos que tienen resúmenes cargados, del más reciente al más antiguo. */
export async function payrollPeriods() {
  const rows = await db.payrollRecord.groupBy({ by: ["period"], _count: true, orderBy: { period: "desc" } });
  return rows.map((r) => ({ period: r.period, count: r._count }));
}

export async function createPayroll(data: Prisma.PayrollRecordUncheckedCreateInput, tx: Prisma.TransactionClient) {
  return tx.payrollRecord.create({ data, include: payrollInclude });
}

/** Reemplaza cabecera y renglones si nadie lo modificó desde `version`. */
export async function updatePayrollVersioned(
  id: string,
  version: Date,
  data: Prisma.PayrollRecordUncheckedUpdateManyInput,
  lines: Prisma.PayrollRecordLineCreateManyInput[],
  tx: Prisma.TransactionClient,
) {
  const { count } = await tx.payrollRecord.updateMany({ where: { id, updatedAt: version }, data });
  if (count !== 1) return false;
  await tx.payrollRecordLine.deleteMany({ where: { payrollRecordId: id } });
  if (lines.length > 0) await tx.payrollRecordLine.createMany({ data: lines });
  return true;
}

export async function conceptTypes(ids: string[], client: Client = db) {
  return client.salaryConceptType.findMany({ where: { id: { in: ids } } });
}

export async function listConceptOptions(includeIds: string[] = []) {
  return db.salaryConceptType.findMany({
    where: { OR: [{ isActive: true }, { id: { in: includeIds } }] },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, nature: true, isActive: true },
  });
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

export function transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return db.$transaction(fn);
}

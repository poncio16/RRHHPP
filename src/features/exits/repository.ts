import "server-only";
import { idsMatchingName } from "@/features/employees/repository";
import { parseIsoDate } from "@/lib/format";
import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import { EXIT_REASON_GROUP, EXIT_TYPE_GROUP } from "./constants";
import type { ExitListQuery } from "./schemas";

type Client = Prisma.TransactionClient | typeof db;

export function transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) {
  return db.$transaction(fn);
}

const exitInclude = {
  employee: { select: { id: true, fileNumber: true, lastName: true, firstName: true, status: true, exitDate: true } },
  exitType: { select: { id: true, label: true } },
  exitReason: { select: { id: true, label: true } },
  confirmedBy: { select: { name: true } },
  _count: { select: { documents: { where: { status: { not: "ANULADO" } } } } },
} satisfies Prisma.EmployeeExitInclude;

export type ExitRow = Prisma.EmployeeExitGetPayload<{ include: typeof exitInclude }>;

const employeeSelect = {
  id: true,
  fileNumber: true,
  lastName: true,
  firstName: true,
  status: true,
  hireDate: true,
  seniorityDate: true,
  contractEndDate: true,
  exitDate: true,
  version: true,
} satisfies Prisma.EmployeeSelect;

export type ExitEmployee = Prisma.EmployeeGetPayload<{ select: typeof employeeSelect }>;

export async function findEmployee(id: string, client: Client = db) {
  return client.employee.findUnique({ where: { id }, select: employeeSelect });
}

/** Bloquea la fila del empleado: altas, confirmaciones y reingresos no se cruzan. */
export async function lockEmployee(id: string, tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT id FROM employee WHERE id = ${id}::uuid FOR UPDATE`;
}

export async function findExit(id: string, client: Client = db) {
  return client.employeeExit.findUnique({ where: { id }, include: exitInclude });
}

export async function findPendingExit(employeeId: string, client: Client = db) {
  return client.employeeExit.findFirst({ where: { employeeId, status: "EN_TRAMITE" }, include: exitInclude });
}

/** Último egreso confirmado del empleado (el que lo dejó egresado). */
export async function findLastConfirmed(employeeId: string, client: Client = db) {
  return client.employeeExit.findFirst({
    where: { employeeId, status: "CONFIRMADO" },
    orderBy: [{ exitDate: "desc" }, { confirmedAt: "desc" }],
    select: { id: true },
  });
}

export async function listEmployeeExits(employeeId: string) {
  return db.employeeExit.findMany({
    where: { employeeId },
    include: exitInclude,
    orderBy: [{ exitDate: "desc" }, { createdAt: "desc" }],
  });
}

const STATUS_WHERE: Record<ExitListQuery["estado"], Prisma.EmployeeExitWhereInput> = {
  vigentes: { status: { not: "ANULADO" } },
  "en-tramite": { status: "EN_TRAMITE" },
  confirmados: { status: "CONFIRMADO" },
  anulados: { status: "ANULADO" },
  todos: {},
};

export async function listExits(query: ExitListQuery) {
  const and: Prisma.EmployeeExitWhereInput[] = [];
  if (query.q) {
    and.push(
      /^\d{1,9}$/.test(query.q)
        ? { employee: { fileNumber: Number(query.q) } }
        : { employeeId: { in: await idsMatchingName(query.q) } },
    );
  }
  if (query.tipo) and.push({ exitTypeId: query.tipo });
  if (query.motivo) and.push({ exitReasonId: query.motivo });
  if (query.desde) and.push({ exitDate: { gte: parseIsoDate(query.desde)! } });
  if (query.hasta) and.push({ exitDate: { lte: parseIsoDate(query.hasta)! } });
  const base: Prisma.EmployeeExitWhereInput = { AND: and };
  const where: Prisma.EmployeeExitWhereInput = { AND: [...and, STATUS_WHERE[query.estado]] };

  const [items, total, byStatus] = await Promise.all([
    db.employeeExit.findMany({
      where,
      include: exitInclude,
      orderBy: [{ exitDate: "desc" }, { createdAt: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.employeeExit.count({ where }),
    db.employeeExit.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
  ]);
  return { items, total, byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])) };
}

export async function createExit(data: Prisma.EmployeeExitUncheckedCreateInput, tx: Prisma.TransactionClient) {
  return tx.employeeExit.create({ data, include: exitInclude });
}

/** Actualiza solo si sigue en esos estados y (si se indica) nadie lo modificó desde que se leyó. */
export async function updateGuarded(
  id: string,
  guard: { statuses: ExitRow["status"][]; version?: Date },
  data: Prisma.EmployeeExitUncheckedUpdateManyInput,
  tx: Prisma.TransactionClient,
) {
  const { count } = await tx.employeeExit.updateMany({
    where: { id, status: { in: guard.statuses }, ...(guard.version ? { updatedAt: guard.version } : {}) },
    data,
  });
  return count === 1;
}

/** Cambia el legajo solo si nadie lo modificó desde que se leyó (`version`). */
export async function updateEmployeeVersioned(
  id: string,
  version: number,
  data: Prisma.EmployeeUncheckedUpdateManyInput,
  tx: Prisma.TransactionClient,
) {
  const { count } = await tx.employee.updateMany({
    where: { id, version },
    data: { ...data, version: { increment: 1 } },
  });
  return count === 1;
}

export async function insertHistory(rows: Prisma.EmployeeChangeHistoryCreateManyInput[], tx: Prisma.TransactionClient) {
  if (rows.length) await tx.employeeChangeHistory.createMany({ data: rows });
}

/**
 * Lo que quedó cargado después de la fecha de egreso y no corresponde a un
 * empleado egresado. Se revisa antes de confirmar.
 */
export async function recordsAfter(employeeId: string, exitDate: Date, exitPeriod: Date, client: Client = db) {
  const [leaves, attendance, salaries, payrolls, novelties] = await Promise.all([
    client.leaveRecord.count({
      where: { employeeId, status: { in: ["SOLICITADA", "APROBADA"] }, endDate: { gt: exitDate } },
    }),
    client.attendanceDay.count({ where: { employeeId, date: { gt: exitDate } } }),
    client.salaryHistory.count({ where: { employeeId, effectiveDate: { gt: exitDate } } }),
    client.payrollRecord.count({ where: { employeeId, period: { gt: exitPeriod } } }),
    client.novelty.count({ where: { employeeId, status: { not: "ANULADA" }, date: { gt: exitDate } } }),
  ]);
  return { leaves, attendance, salaries, payrolls, novelties };
}

/** Avisos al confirmar: personal a cargo y usuario del sistema activo. */
export async function exitWarnings(employeeId: string, client: Client = db) {
  const [subordinates, user] = await Promise.all([
    client.employee.count({ where: { supervisorId: employeeId, status: "ACTIVO" } }),
    client.user.findFirst({ where: { employeeId, isActive: true }, select: { email: true } }),
  ]);
  return { subordinates, userEmail: user?.email ?? null };
}

/* ----------------------------------------------------------------------------
 * Opciones
 * ------------------------------------------------------------------------- */

export async function lookupOptions(group: typeof EXIT_TYPE_GROUP | typeof EXIT_REASON_GROUP, includeIds: string[]) {
  return db.lookupValue.findMany({
    where: { group, OR: [{ isActive: true }, { id: { in: includeIds } }] },
    select: { id: true, label: true, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
}

export async function findLookup(id: string, group: string, client: Client = db) {
  return client.lookupValue.findFirst({ where: { id, group }, select: { id: true, label: true, isActive: true } });
}

/** Empleados activos sin un egreso en trámite (para registrar uno desde el listado). */
export async function listEmployeeOptions() {
  const rows = await db.employee.findMany({
    where: { status: "ACTIVO", exits: { none: { status: "EN_TRAMITE" } } },
    select: { id: true, fileNumber: true, lastName: true, firstName: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  return rows.map((e) => ({ id: e.id, label: `${e.lastName}, ${e.firstName} (${e.fileNumber})` }));
}

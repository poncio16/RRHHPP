import "server-only";
import { idsMatchingName } from "@/features/employees/repository";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";

type Client = Prisma.TransactionClient | typeof db;

export async function listRules(client: Client = db) {
  return client.vacationRule.findMany({ orderBy: { minSeniorityYears: "asc" } });
}

/** Reemplaza la tabla de reglas completa (es un parámetro; la auditoría guarda la anterior). */
export async function replaceRules(
  rules: { minSeniorityYears: number; maxSeniorityYears: number | null; days: number }[],
  actorId: string,
  tx: Prisma.TransactionClient,
) {
  await tx.vacationRule.deleteMany({});
  await tx.vacationRule.createMany({ data: rules.map((r) => ({ ...r, updatedById: actorId })) });
}

const balanceEmployee = {
  select: { id: true, fileNumber: true, lastName: true, firstName: true, status: true },
} as const;

/** Períodos de un año (o de un empleado), con el empleado. */
export async function listBalances(scope: { year?: number; employeeId?: string; q?: string }) {
  const and: Prisma.VacationBalanceWhereInput[] = [];
  if (scope.year) and.push({ year: scope.year });
  if (scope.employeeId) and.push({ employeeId: scope.employeeId });
  if (scope.q) {
    const q = scope.q;
    and.push(
      /^\d{1,9}$/.test(q) ? { employee: { fileNumber: Number(q) } } : { employeeId: { in: await idsMatchingName(q) } },
    );
  }
  return db.vacationBalance.findMany({
    where: { AND: and },
    include: { employee: balanceEmployee },
    orderBy: [{ employee: { lastName: "asc" } }, { employee: { firstName: "asc" } }, { year: "desc" }],
  });
}

export type BalanceRow = Awaited<ReturnType<typeof listBalances>>[number];

export async function listBalanceYears(): Promise<number[]> {
  const rows = await db.vacationBalance.findMany({
    distinct: ["year"],
    select: { year: true },
    orderBy: { year: "desc" },
  });
  return rows.map((r) => r.year);
}

export async function findBalance(id: string, client: Client = db) {
  return client.vacationBalance.findUnique({ where: { id }, include: { employee: balanceEmployee } });
}

/** Empleados activos sin período generado para el año, con lo necesario para calcularlo. */
export async function employeesWithoutBalance(year: number, client: Client = db) {
  return client.employee.findMany({
    where: { status: "ACTIVO", vacationBalances: { none: { year } } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      fileNumber: true,
      lastName: true,
      firstName: true,
      hireDate: true,
      seniorityDate: true,
      workSchedule: { select: { days: { select: { dayOfWeek: true } } } },
    },
  });
}

export async function countBalances(year: number, client: Client = db) {
  return client.vacationBalance.count({ where: { year } });
}

export async function createBalance(data: Prisma.VacationBalanceUncheckedCreateInput, tx: Prisma.TransactionClient) {
  return tx.vacationBalance.create({ data });
}

/** Actualiza solo si nadie lo modificó desde `updatedAt`; devuelve false si hubo otro cambio. */
export async function updateBalanceVersioned(
  id: string,
  updatedAt: Date,
  data: Prisma.VacationBalanceUncheckedUpdateManyInput,
  tx: Prisma.TransactionClient,
) {
  const result = await tx.vacationBalance.updateMany({ where: { id, updatedAt }, data });
  return result.count === 1;
}

export function transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return db.$transaction(fn);
}

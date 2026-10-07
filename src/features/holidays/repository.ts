import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";

export async function listByYear(year: number) {
  return db.holiday.findMany({
    where: { date: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } },
    orderBy: { date: "asc" },
  });
}

/** Años con feriados cargados, para el filtro. */
export async function listYears(): Promise<number[]> {
  const rows = await db.$queryRaw<{ year: number }[]>`
    SELECT DISTINCT EXTRACT(YEAR FROM date)::int AS year FROM holiday ORDER BY year`;
  return rows.map((r) => r.year);
}

export async function findById(id: string, client: Prisma.TransactionClient | typeof db = db) {
  return client.holiday.findUnique({ where: { id } });
}

export async function create(data: Prisma.HolidayCreateInput, tx: Prisma.TransactionClient) {
  return tx.holiday.create({ data });
}

export async function update(id: string, data: Prisma.HolidayUpdateInput, tx: Prisma.TransactionClient) {
  return tx.holiday.update({ where: { id }, data });
}

export async function remove(id: string, tx: Prisma.TransactionClient) {
  return tx.holiday.delete({ where: { id } });
}

export function transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return db.$transaction(fn);
}

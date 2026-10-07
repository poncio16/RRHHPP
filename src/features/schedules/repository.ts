import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";

type Client = Prisma.TransactionClient | typeof db;

const scheduleInclude = {
  days: { orderBy: { dayOfWeek: "asc" } },
  workModality: { select: { label: true } },
} satisfies Prisma.WorkScheduleInclude;

export type ScheduleRecord = Prisma.WorkScheduleGetPayload<{ include: typeof scheduleInclude }>;

export async function listSchedules(status: "activos" | "inactivos" | "todos") {
  return db.workSchedule.findMany({
    where: status === "activos" ? { isActive: true } : status === "inactivos" ? { isActive: false } : {},
    include: scheduleInclude,
    orderBy: { name: "asc" },
  });
}

export async function findSchedule(id: string, client: Client = db) {
  return client.workSchedule.findUnique({ where: { id }, include: scheduleInclude });
}

type DayData = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  crossesMidnight: boolean;
};
type ScheduleData = { name: string; workModalityId: string | null; weeklyHours: string };

export async function createSchedule(
  data: ScheduleData,
  days: DayData[],
  actorId: string,
  tx: Prisma.TransactionClient,
) {
  return tx.workSchedule.create({
    data: { ...data, createdById: actorId, updatedById: actorId, days: { create: days } },
    include: scheduleInclude,
  });
}

/** Actualiza el horario y reemplaza sus días. */
export async function updateSchedule(
  id: string,
  data: ScheduleData,
  days: DayData[],
  actorId: string,
  tx: Prisma.TransactionClient,
) {
  await tx.workScheduleDay.deleteMany({ where: { scheduleId: id } });
  return tx.workSchedule.update({
    where: { id },
    data: { ...data, updatedById: actorId, days: { create: days } },
    include: scheduleInclude,
  });
}

export async function setActive(id: string, isActive: boolean, actorId: string, tx: Prisma.TransactionClient) {
  return tx.workSchedule.update({ where: { id }, data: { isActive, updatedById: actorId } });
}

export function transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return db.$transaction(fn);
}

import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { labelsFor, type RefModel } from "@/features/employees/repository";
import { db } from "@/server/db";

const listSelect = {
  id: true,
  occurredAt: true,
  userId: true,
  userEmail: true,
  action: true,
  module: true,
  entityType: true,
  entityId: true,
  result: true,
  message: true,
  ip: true,
  user: { select: { name: true } },
} satisfies Prisma.AuditLogSelect;

export async function listEntries(where: Prisma.AuditLogWhereInput, skip: number, take: number) {
  const [items, total] = await Promise.all([
    db.auditLog.findMany({ where, select: listSelect, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], skip, take }),
    db.auditLog.count({ where }),
  ]);
  return { items, total };
}

export function findEntry(id: string) {
  return db.auditLog.findUnique({ where: { id }, include: { user: { select: { name: true, email: true } } } });
}

/** Módulos que tienen eventos, para el filtro. */
export async function usedModules(): Promise<string[]> {
  const rows = await db.auditLog.findMany({
    distinct: ["module"],
    select: { module: true },
    orderBy: { module: "asc" },
  });
  return rows.map((r) => r.module);
}

export function userOptions() {
  return db.user.findMany({
    select: { id: true, name: true, email: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });
}

export function findUser(id: string) {
  return db.user.findUnique({ where: { id }, select: { name: true, email: true } });
}

/** Campos con IDs que se pueden mostrar por su nombre. */
const REF_FIELDS: Record<string, RefModel> = {
  departmentId: "department",
  positionId: "position",
  categoryId: "category",
  agreementId: "agreement",
  contractTypeId: "contractType",
  workdayTypeId: "workdayType",
  workScheduleId: "workSchedule",
  workModalityId: "lookup",
  nationalityId: "lookup",
  maritalStatusId: "lookup",
  accountTypeId: "lookup",
  workplaceId: "workplace",
  supervisorId: "employee",
  employeeId: "employee",
};

/** Nombres de los catálogos y empleados referidos en el antes y el después de un evento. */
export async function referenceLabels(values: unknown[]) {
  const ids = values.flatMap((value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.entries(value).flatMap(([field, id]) =>
          REF_FIELDS[field] && typeof id === "string" ? [{ model: REF_FIELDS[field], id }] : [],
        )
      : [],
  );
  return ids.length > 0 ? labelsFor(ids, db) : new Map<string, string>();
}

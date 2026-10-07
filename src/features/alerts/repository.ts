import "server-only";
import { db } from "@/server/db";

const employeeRef = { select: { id: true, fileNumber: true, lastName: true, firstName: true } } as const;

/**
 * Documentos de personal activo que vencen hasta `until` (incluidos los ya
 * vencidos), sin otro documento del mismo tipo que venza después.
 */
export async function expiringDocuments(until: Date) {
  const rows = await db.document.findMany({
    where: { status: { not: "ANULADO" }, expiryDate: { not: null, lte: until }, employee: { status: "ACTIVO" } },
    select: {
      id: true,
      employeeId: true,
      documentTypeId: true,
      expiryDate: true,
      employee: employeeRef,
      documentType: { select: { name: true, isSensitive: true, alertDaysBefore: true } },
    },
    orderBy: { expiryDate: "asc" },
  });
  if (rows.length === 0) return rows;
  // Renovados: hay un documento vigente del mismo tipo con vencimiento posterior (o sin vencimiento).
  const renewals = await db.document.findMany({
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
  return rows.filter(
    (r) =>
      !renewals.some(
        (n) =>
          n.employeeId === r.employeeId &&
          n.documentTypeId === r.documentTypeId &&
          (n.expiryDate === null || n.expiryDate > r.expiryDate!),
      ),
  );
}

/** Licencias aprobadas (no vacaciones) de personal activo que terminan entre hoy y `until`. */
export async function endingLeaves(today: Date, until: Date) {
  return db.leaveRecord.findMany({
    where: {
      status: "APROBADA",
      endDate: { gte: today, lte: until },
      leaveType: { class: { not: "VACACIONES" } },
      employee: { status: "ACTIVO" },
    },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      employee: employeeRef,
      leaveType: { select: { name: true, class: true, isSensitive: true } },
    },
    orderBy: { endDate: "asc" },
  });
}

/** Vacaciones aprobadas de personal activo que empiezan entre hoy y `until`. */
export async function upcomingVacations(today: Date, until: Date) {
  return db.leaveRecord.findMany({
    where: {
      status: "APROBADA",
      startDate: { gte: today, lte: until },
      leaveType: { class: "VACACIONES" },
      employee: { status: "ACTIVO" },
    },
    select: { id: true, startDate: true, endDate: true, days: true, employee: employeeRef },
    orderBy: { startDate: "asc" },
  });
}

/** Períodos de vacaciones de años anteriores de personal activo (el saldo se calcula en el servicio). */
export async function pastVacationBalances(beforeYear: number) {
  return db.vacationBalance.findMany({
    where: { year: { lt: beforeYear }, employee: { status: "ACTIVO" } },
    select: {
      id: true,
      year: true,
      entitledDays: true,
      adjustmentDays: true,
      carriedOverDays: true,
      employee: employeeRef,
    },
    orderBy: [{ year: "asc" }],
  });
}

/** Contratos a plazo de personal activo que terminan hasta `until` (incluidos los ya vencidos). */
export async function endingContracts(until: Date) {
  return db.employee.findMany({
    where: { status: "ACTIVO", contractEndDate: { not: null, lte: until } },
    select: { ...employeeRef.select, contractEndDate: true },
    orderBy: { contractEndDate: "asc" },
  });
}

export async function activeBirthdays() {
  return db.employee.findMany({
    where: { status: "ACTIVO" },
    select: { ...employeeRef.select, birthDate: true },
  });
}

export async function activeLegajos() {
  const rows = await db.employee.findMany({
    where: { status: "ACTIVO" },
    select: {
      ...employeeRef.select,
      workScheduleId: true,
      healthInsurerId: true,
      artProviderId: true,
      phone: true,
      email: true,
      emergencyContactName: true,
      emergencyContactPhone: true,
      bankAccount: { select: { id: true } },
      _count: { select: { salaryHistory: true } },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  return rows.map(({ bankAccount, _count, ...e }) => ({
    ...e,
    hasBankAccount: !!bankAccount,
    hasSalary: _count.salaryHistory > 0,
  }));
}

/* ----------------------------------------------------------------------------
 * Descartes y posposiciones
 * ------------------------------------------------------------------------- */

export async function listDismissals(keys: string[]) {
  if (keys.length === 0) return [];
  return db.alertDismissal.findMany({
    where: { alertKey: { in: keys } },
    select: { alertKey: true, dismissedUntil: true, createdAt: true, dismissedBy: { select: { name: true } } },
  });
}

export async function upsertDismissal(alertKey: string, dismissedUntil: Date | null, userId: string) {
  return db.alertDismissal.upsert({
    where: { alertKey },
    create: { alertKey, dismissedUntil, dismissedById: userId },
    update: { dismissedUntil, dismissedById: userId, createdAt: new Date() },
  });
}

export async function deleteDismissal(alertKey: string) {
  const { count } = await db.alertDismissal.deleteMany({ where: { alertKey } });
  return count === 1;
}

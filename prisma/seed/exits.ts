import type { PrismaClient } from "../../src/generated/prisma/client";

const DAY = 86_400_000;

/**
 * Egresos de demostración (ficticios): uno confirmado con fecha de hoy y uno
 * en trámite con fecha futura. Solo se crean si todavía no hay ningún egreso.
 */
export async function seedExits(db: PrismaClient): Promise<number> {
  if ((await db.employeeExit.count()) > 0) return 0;
  const [type, otherType, reason, otherReason, admin] = await Promise.all([
    db.lookupValue.findFirst({ where: { group: "TIPO_EGRESO", code: "RENUNCIA" } }),
    db.lookupValue.findFirst({ where: { group: "TIPO_EGRESO", code: "MUTUO_ACUERDO" } }),
    db.lookupValue.findFirst({ where: { group: "MOTIVO_EGRESO", code: "MEJOR_OFERTA" } }),
    db.lookupValue.findFirst({ where: { group: "MOTIVO_EGRESO", code: "MUDANZA" } }),
    db.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } }),
  ]);
  if (!type || !otherType || !reason || !otherReason) return 0;

  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const candidates = await db.employee.findMany({
    where: { status: "ACTIVO", subordinates: { none: {} }, user: null },
    select: { id: true, hireDate: true },
    orderBy: { fileNumber: "desc" },
  });

  // Confirmado: el primero sin nada cargado después de hoy.
  let confirmedId: string | null = null;
  for (const c of candidates) {
    if (c.hireDate > today) continue;
    const period = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const after = await Promise.all([
      db.leaveRecord.count({
        where: { employeeId: c.id, status: { in: ["SOLICITADA", "APROBADA"] }, endDate: { gt: today } },
      }),
      db.attendanceDay.count({ where: { employeeId: c.id, date: { gt: today } } }),
      db.salaryHistory.count({ where: { employeeId: c.id, effectiveDate: { gt: today } } }),
      db.payrollRecord.count({ where: { employeeId: c.id, period: { gt: period } } }),
      db.novelty.count({ where: { employeeId: c.id, status: { not: "ANULADA" }, date: { gt: today } } }),
    ]);
    if (after.every((n) => n === 0)) {
      confirmedId = c.id;
      break;
    }
  }
  let created = 0;
  if (confirmedId) {
    await db.$transaction([
      db.employeeExit.create({
        data: {
          employeeId: confirmedId,
          exitDate: today,
          exitTypeId: type.id,
          exitReasonId: reason.id,
          status: "CONFIRMADO",
          notes: "Dato ficticio de demostración.",
          confirmedById: admin?.id ?? null,
          confirmedAt: now,
          createdById: admin?.id ?? null,
        },
      }),
      db.employee.update({
        where: { id: confirmedId },
        data: { status: "EGRESADO", exitDate: today, version: { increment: 1 } },
      }),
    ]);
    created++;
  }

  const pending = candidates.find((c) => c.id !== confirmedId);
  if (pending) {
    await db.employeeExit.create({
      data: {
        employeeId: pending.id,
        exitDate: new Date(today.getTime() + 15 * DAY),
        exitTypeId: otherType.id,
        exitReasonId: otherReason.id,
        notes: "Dato ficticio de demostración: preaviso en curso.",
        createdById: admin?.id ?? null,
      },
    });
    created++;
  }
  return created;
}

import type { PrismaClient } from "../../src/generated/prisma/client";
import { defaultWorkDays } from "../../src/features/leaves/days";
import { vacationEntitlement } from "../../src/features/vacations/entitlement";
import { defaultSetting } from "../../src/server/settings/definitions";

/**
 * Tipos de licencia (los que pide el relevamiento; se editan desde
 * Configuración), reglas de vacaciones, períodos 2025 y 2026, y registros de
 * demostración. Los días se cuentan corridos y las reglas son los valores de
 * referencia de la LCT: todo queda "a validar" con el asesor laboral.
 */
type LeaveTypeSeed = {
  name: string;
  class: "LICENCIA" | "AUSENCIA" | "VACACIONES" | "SUSPENSION";
  isPaid?: boolean;
  requiresCertificate?: boolean;
  countsForAbsenteeism?: boolean;
  isSensitive?: boolean;
};

const LEAVE_TYPES: LeaveTypeSeed[] = [
  { name: "Enfermedad", class: "LICENCIA", requiresCertificate: true, countsForAbsenteeism: true, isSensitive: true },
  { name: "Accidente", class: "LICENCIA", requiresCertificate: true, countsForAbsenteeism: true, isSensitive: true },
  { name: "Maternidad", class: "LICENCIA", requiresCertificate: true },
  { name: "Paternidad", class: "LICENCIA", requiresCertificate: true },
  { name: "Estudio", class: "LICENCIA" },
  { name: "Examen", class: "LICENCIA", requiresCertificate: true },
  { name: "Familiar", class: "LICENCIA" },
  { name: "Matrimonio", class: "LICENCIA", requiresCertificate: true },
  { name: "Fallecimiento de familiar", class: "LICENCIA", requiresCertificate: true },
  { name: "Donación de sangre", class: "LICENCIA", requiresCertificate: true },
  { name: "Vacaciones", class: "VACACIONES" },
  { name: "Licencia sin goce de haberes", class: "LICENCIA", isPaid: false },
  { name: "Otras licencias", class: "LICENCIA" },
  { name: "Ausencia con aviso", class: "AUSENCIA", countsForAbsenteeism: true },
  { name: "Ausencia sin aviso", class: "AUSENCIA", isPaid: false, countsForAbsenteeism: true },
  { name: "Suspensión disciplinaria", class: "SUSPENSION", isPaid: false },
];

/** Valores de referencia de la LCT (art. 150), editables en Configuración → Vacaciones. */
const VACATION_RULES = [
  { minSeniorityYears: 0, maxSeniorityYears: 5, days: 14 },
  { minSeniorityYears: 5, maxSeniorityYears: 10, days: 21 },
  { minSeniorityYears: 10, maxSeniorityYears: 20, days: 28 },
  { minSeniorityYears: 20, maxSeniorityYears: null, days: 35 },
];

const DAY = 86_400_000;

function fromToday(days: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + days * DAY);
}

type DemoLeave = {
  file: number;
  type: string;
  from: number;
  to: number;
  status: "SOLICITADA" | "APROBADA" | "RECHAZADA";
  /** Período de vacaciones al que se imputa. */
  period?: number;
  notes?: string;
  decision?: string;
  /** Registra el certificado médico (sin archivo) vinculado a la licencia. */
  certificate?: boolean;
};

const DEMO: DemoLeave[] = [
  { file: 1, type: "Vacaciones", from: -270, to: -250, status: "APROBADA", period: 2025 },
  { file: 2, type: "Vacaciones", from: 20, to: 33, status: "APROBADA", period: 2026 },
  {
    file: 3,
    type: "Enfermedad",
    from: -40,
    to: -36,
    status: "APROBADA",
    notes: "Reposo indicado por el médico.",
    certificate: true,
  },
  { file: 4, type: "Vacaciones", from: -255, to: -235, status: "APROBADA", period: 2025 },
  { file: 6, type: "Vacaciones", from: 45, to: 58, status: "SOLICITADA", period: 2026, notes: "Viaje familiar." },
  { file: 9, type: "Enfermedad", from: -3, to: 4, status: "APROBADA" },
  { file: 12, type: "Ausencia sin aviso", from: -20, to: -20, status: "APROBADA" },
  { file: 14, type: "Vacaciones", from: -240, to: -227, status: "APROBADA", period: 2025 },
  { file: 15, type: "Examen", from: 10, to: 11, status: "SOLICITADA", notes: "Final de Contabilidad II." },
  { file: 16, type: "Paternidad", from: -120, to: -119, status: "APROBADA" },
  { file: 17, type: "Matrimonio", from: -200, to: -191, status: "APROBADA" },
  {
    file: 18,
    type: "Licencia sin goce de haberes",
    from: 30,
    to: 60,
    status: "RECHAZADA",
    decision: "Coincide con el inventario anual.",
  },
  { file: 19, type: "Donación de sangre", from: -15, to: -15, status: "APROBADA" },
  {
    file: 20,
    type: "Suspensión disciplinaria",
    from: -1,
    to: 2,
    status: "APROBADA",
    notes: "Ficticia, para demostración.",
  },
  { file: 21, type: "Vacaciones", from: 3, to: 9, status: "APROBADA", period: 2026 },
];

export async function seedLeaves(db: PrismaClient): Promise<{ types: number; balances: number; records: number }> {
  const existingTypes = new Set((await db.leaveType.findMany({ select: { name: true } })).map((t) => t.name));
  const { count: types } = await db.leaveType.createMany({
    data: LEAVE_TYPES.filter((t) => !existingTypes.has(t.name)).map((t, i) => ({
      ...t,
      countingMode: "CORRIDOS" as const,
      sortOrder: i,
    })),
  });

  if ((await db.vacationRule.count()) === 0) await db.vacationRule.createMany({ data: VACATION_RULES });

  // Períodos 2025 y 2026 de los empleados activos, calculados con las reglas y los parámetros por defecto.
  const rules = await db.vacationRule.findMany({ orderBy: { minSeniorityYears: "asc" } });
  const settings = defaultSetting("vacations");
  const employees = await db.employee.findMany({
    where: { status: "ACTIVO" },
    select: {
      id: true,
      fileNumber: true,
      hireDate: true,
      seniorityDate: true,
      workSchedule: { select: { days: { select: { dayOfWeek: true } } } },
    },
  });
  const holidays = new Set(
    (await db.holiday.findMany({ where: { isNonWorkingOptional: false } })).map((h) =>
      h.date.toISOString().slice(0, 10),
    ),
  );
  let balances = 0;
  for (const year of [2025, 2026]) {
    for (const employee of employees) {
      const days = employee.workSchedule?.days.map((d) => d.dayOfWeek) ?? [];
      const result = vacationEntitlement({
        year,
        cutoff: { month: settings.cutoffMonth, day: settings.cutoffDay },
        seniorityDate: employee.seniorityDate,
        hireDate: employee.hireDate,
        rules,
        proportionalMinPercent: settings.proportionalMinPercent,
        proportionalWorkedDays: settings.proportionalWorkedDays,
        workDays: days.length > 0 ? new Set(days) : defaultWorkDays(defaultSetting("leaves").defaultWorkDays),
        holidays,
      });
      if (!result) continue;
      const { count } = await db.vacationBalance.createMany({
        data: [
          {
            employeeId: employee.id,
            year,
            entitledDays: result.days,
            notes: result.proportional
              ? `Proporcional: ${result.workedDays} de ${result.periodWorkDays} días hábiles trabajados.`
              : null,
          },
        ],
        skipDuplicates: true,
      });
      balances += count;
    }
  }

  // Los registros de demostración se cargan una sola vez (sus fechas son relativas a hoy).
  const admin = await db.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!admin || (await db.leaveRecord.count()) > 0) return { types, balances, records: 0 };
  const typeIds = new Map((await db.leaveType.findMany()).map((t) => [t.name, t.id]));
  const byFile = new Map(employees.map((e) => [e.fileNumber, e.id]));
  let records = 0;
  for (const demo of DEMO) {
    const employeeId = byFile.get(demo.file);
    const leaveTypeId = typeIds.get(demo.type);
    if (!employeeId || !leaveTypeId) continue;
    const balance = demo.period
      ? await db.vacationBalance.findUnique({ where: { employeeId_year: { employeeId, year: demo.period } } })
      : null;
    if (demo.period && !balance) continue;
    const decided = demo.status !== "SOLICITADA";
    const record = await db.leaveRecord.create({
      data: {
        employeeId,
        leaveTypeId,
        startDate: fromToday(demo.from),
        endDate: fromToday(demo.to),
        days: demo.to - demo.from + 1,
        status: demo.status,
        vacationBalanceId: balance?.id ?? null,
        notes: demo.notes ?? null,
        decisionNotes: demo.decision ?? null,
        requestedById: admin.id,
        decidedById: decided ? admin.id : null,
        decidedAt: decided ? new Date() : null,
        updatedById: admin.id,
      },
    });
    const certificateType = await db.documentType.findFirst({ where: { name: "Certificado médico" } });
    if (demo.certificate && certificateType) {
      await db.document.create({
        data: {
          employeeId,
          documentTypeId: certificateType.id,
          leaveRecordId: record.id,
          issueDate: fromToday(demo.from),
          notes: "Certificado ficticio, para demostración.",
          createdById: admin.id,
        },
      });
    }
    records++;
  }
  return { types, balances, records };
}

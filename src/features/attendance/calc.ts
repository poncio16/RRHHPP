/**
 * Cálculos de asistencia (funciones puras, se usan en el servidor y en las
 * pruebas). Las horas se guardan como minutos enteros.
 */
import { zonedInstant } from "@/lib/format";
import { isoWeekday } from "@/features/leaves/days";
import { parseTime, workedMinutes } from "@/features/schedules/calc";
import type { AttendanceStatus } from "./constants";

export type ScheduleSlot = { dayOfWeek: number; startTime: string; endTime: string; breakMinutes: number };

/** Qué se esperaba del empleado ese día, sin contar licencias. */
export type DayPlan =
  /** Día del horario asignado. */
  | { kind: "turno"; slot: ScheduleSlot }
  /** Día hábil de un empleado sin horario asignado (días del parámetro). */
  | { kind: "habil" }
  /** Día que no figura en el horario. */
  | { kind: "franco" }
  | { kind: "feriado"; name: string };

/**
 * Plan del día: feriado (salvo los no laborables optativos, que se pasan como
 * `null`), día del horario, o franco. Sin horario asignado se usan los días
 * hábiles por defecto.
 */
export function dayPlan(
  date: Date,
  schedule: ScheduleSlot[] | null,
  defaultWorkDays: Set<number>,
  holiday: { name: string } | null,
): DayPlan {
  if (holiday) return { kind: "feriado", name: holiday.name };
  const weekday = isoWeekday(date);
  if (schedule && schedule.length > 0) {
    const slot = schedule.find((s) => s.dayOfWeek === weekday);
    return slot ? { kind: "turno", slot } : { kind: "franco" };
  }
  return defaultWorkDays.has(weekday) ? { kind: "habil" } : { kind: "franco" };
}

export const isWorkday = (plan: DayPlan) => plan.kind === "turno" || plan.kind === "habil";

/**
 * Estado del día: con una licencia aprobada que lo cubre, "con licencia";
 * si hay fichada, presente; si no, feriado, franco o ausente.
 */
export function attendanceStatus(plan: DayPlan, hasTimes: boolean, coveredByLeave: boolean): AttendanceStatus {
  if (coveredByLeave) return "JUSTIFICADO";
  if (hasTimes) return "PRESENTE";
  if (plan.kind === "feriado") return "FERIADO";
  if (plan.kind === "franco") return "FRANCO";
  return "AUSENTE";
}

/** Entrada y salida del día como instantes; una salida a la misma hora o antes es del día siguiente. */
export function shiftInstants(date: Date, checkIn: string, checkOut: string, timeZone?: string) {
  const start = parseTime(checkIn)!;
  let end = parseTime(checkOut)!;
  if (end <= start) end += 24 * 60;
  return { checkIn: zonedInstant(date, start, timeZone), checkOut: zonedInstant(date, end, timeZone) };
}

/** Minutos entre entrada y salida, antes de descontar el descanso. */
export const spanMinutes = (checkIn: Date, checkOut: Date) =>
  Math.round((checkOut.getTime() - checkIn.getTime()) / 60_000);

export type AttendanceParams = {
  date: Date;
  checkIn: Date;
  checkOut: Date;
  breakMinutes: number;
  plan: DayPlan;
  /** Llegar hasta esta cantidad de minutos después del horario no cuenta como tarde. */
  lateToleranceMinutes: number;
  /** Lo trabajado por encima del horario cuenta como adicional desde esta cantidad de minutos. */
  extraMinimumMinutes: number;
  timeZone?: string;
};

export type AttendanceMinutes = { worked: number; regular: number; extra: number; late: number };

/**
 * Trabajados: de entrada a salida menos el descanso. En un día del horario,
 * normales hasta lo que el horario prevé y adicionales lo que exceda (si
 * llega al mínimo configurado); tarde, los minutos después de la hora de
 * entrada si superan la tolerancia (se cuentan completos). Un franco o
 * feriado trabajado es todo adicional. Sin horario asignado no hay
 * referencia: todo es normal y no hay tardanza.
 */
export function attendanceMinutes(params: AttendanceParams): AttendanceMinutes {
  const worked = Math.max(0, spanMinutes(params.checkIn, params.checkOut) - params.breakMinutes);
  const { plan } = params;
  if (plan.kind === "habil") return { worked, regular: worked, extra: 0, late: 0 };
  if (plan.kind !== "turno") return { worked, regular: 0, extra: worked, late: 0 };

  const expected = workedMinutes(plan.slot.startTime, plan.slot.endTime, plan.slot.breakMinutes) ?? 0;
  const excess = worked - expected;
  const extra = excess > 0 && excess >= params.extraMinimumMinutes ? excess : 0;
  const scheduledStart = zonedInstant(params.date, parseTime(plan.slot.startTime)!, params.timeZone);
  const lateBy = Math.round((params.checkIn.getTime() - scheduledStart.getTime()) / 60_000);
  const late = lateBy > params.lateToleranceMinutes ? lateBy : 0;
  return { worked, regular: Math.min(worked, expected), extra, late };
}

/** Entrada, salida y descanso que prevé el horario ese día; `endsAt` es el instante de la salida. */
export type ScheduledTimes = { checkIn: string; checkOut: string; breakMinutes: number; endsAt: string };

export function scheduledTimes(date: Date, slot: ScheduleSlot, timeZone?: string): ScheduledTimes {
  return {
    checkIn: slot.startTime,
    checkOut: slot.endTime,
    breakMinutes: slot.breakMinutes,
    endsAt: shiftInstants(date, slot.startTime, slot.endTime, timeZone).checkOut.toISOString(),
  };
}

/** Lo cargado es exactamente el turno del horario (un descanso vacío toma el del horario). */
export function matchesSchedule(
  plan: DayPlan,
  fields: { checkIn: string | null; checkOut: string | null; breakMinutes: number | null },
): boolean {
  return (
    plan.kind === "turno" &&
    fields.checkIn === plan.slot.startTime &&
    fields.checkOut === plan.slot.endTime &&
    (fields.breakMinutes ?? plan.slot.breakMinutes) === plan.slot.breakMinutes
  );
}

export type FillCandidate = {
  id: string;
  scheduled: ScheduledTimes | null;
  /** Día hábil sin licencia y sin asistencia guardada. */
  open: boolean;
  /** Ya tiene algo escrito en la planilla (horas o ausente). */
  touched: boolean;
};

/**
 * Filas que llena "Completar con el horario": días del horario sin licencia,
 * sin asistencia guardada ni nada escrito, cuyo turno ya terminó. Las que no
 * tienen horario asignado o cuyo turno todavía no terminó se cuentan para
 * avisarlo; nunca se pisa lo guardado ni lo escrito.
 */
export function scheduleFill(rows: FillCandidate[], now: Date) {
  const fill: string[] = [];
  let notFinished = 0;
  let withoutSchedule = 0;
  for (const row of rows) {
    if (!row.open || row.touched) continue;
    if (!row.scheduled) withoutSchedule++;
    else if (new Date(row.scheduled.endsAt) > now) notFinished++;
    else fill.push(row.id);
  }
  return { fill, notFinished, withoutSchedule };
}

/** 450 → "7:30". */
export function formatMinutes(minutes: number): string {
  const sign = minutes < 0 ? "-" : "";
  const abs = Math.abs(minutes);
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
}

/** Descripción del plan para mostrar ("09:00–18:00", "Franco", "Feriado: …"). */
export function planLabel(plan: DayPlan): string {
  switch (plan.kind) {
    case "turno":
      return `${plan.slot.startTime}–${plan.slot.endTime}`;
    case "habil":
      return "Sin horario asignado";
    case "franco":
      return "Franco";
    case "feriado":
      return `Feriado: ${plan.name}`;
  }
}

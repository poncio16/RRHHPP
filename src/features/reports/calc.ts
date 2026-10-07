import { countDays, isoKey, isoWeekday } from "@/features/leaves/days";

/*
 * Cálculos puros de los reportes. Fechas de calendario en UTC.
 */

const DAY = 86_400_000;
const max = (a: Date, b: Date) => (a > b ? a : b);
const min = (a: Date, b: Date) => (a < b ? a : b);

/* ----------------------------------------------------------------------------
 * Ausentismo
 * ------------------------------------------------------------------------- */

export type AbsenceEmployee = {
  id: string;
  hireDate: Date;
  exitDate: Date | null;
  /** Días de la semana que trabaja (1 = lunes); sin horario, los días por defecto. */
  workDays: ReadonlySet<number>;
};

export type AbsenceInput = {
  start: Date;
  end: Date;
  employees: AbsenceEmployee[];
  holidays: ReadonlySet<string>;
  /** Días con ausencia registrada en asistencia. */
  absentDays: { employeeId: string; date: Date }[];
  /** Licencias aprobadas de tipos que cuentan para ausentismo; `type` agrupa el reporte por tipo. */
  leaves: { employeeId: string; startDate: Date; endDate: Date; type: string }[];
  /** Nombre del tipo para las ausencias cargadas en asistencia sin licencia. */
  attendanceType: string;
};

export type EmployeeAbsence = { expected: number; lost: number; byType: Map<string, number> };

/**
 * Días de trabajo previstos y perdidos por persona. Solo cuentan los días
 * hábiles de cada una (su horario, sin feriados) dentro de su período de
 * empleo. Un día cuenta una sola vez: si hay licencia y ausencia, se atribuye
 * a la licencia, que dice el motivo.
 */
export function absenceBreakdown(input: AbsenceInput): Map<string, EmployeeAbsence> {
  const result = new Map<string, EmployeeAbsence>();
  const lostDays = new Map<string, Map<string, string>>(); // empleado → día → tipo
  const byId = new Map(input.employees.map((e) => [e.id, e]));
  const windowOf = (e: AbsenceEmployee) => ({
    from: max(input.start, e.hireDate),
    to: e.exitDate ? min(input.end, e.exitDate) : input.end,
  });
  const isWorkDay = (e: AbsenceEmployee, date: Date) => {
    const { from, to } = windowOf(e);
    return date >= from && date <= to && e.workDays.has(isoWeekday(date)) && !input.holidays.has(isoKey(date));
  };
  const mark = (e: AbsenceEmployee, date: Date, type: string, override: boolean) => {
    if (!isWorkDay(e, date)) return;
    const days = lostDays.get(e.id) ?? new Map<string, string>();
    if (override || !days.has(isoKey(date))) days.set(isoKey(date), type);
    lostDays.set(e.id, days);
  };

  for (const a of input.absentDays) {
    const e = byId.get(a.employeeId);
    if (e) mark(e, a.date, input.attendanceType, false);
  }
  for (const l of input.leaves) {
    const e = byId.get(l.employeeId);
    if (!e) continue;
    for (let t = max(l.startDate, input.start).getTime(); t <= min(l.endDate, input.end).getTime(); t += DAY) {
      mark(e, new Date(t), l.type, true);
    }
  }
  for (const e of input.employees) {
    const { from, to } = windowOf(e);
    const days = lostDays.get(e.id);
    const byType = new Map<string, number>();
    for (const type of days?.values() ?? []) byType.set(type, (byType.get(type) ?? 0) + 1);
    result.set(e.id, {
      expected: countDays(from, to, "HABILES", e.workDays, input.holidays),
      lost: days?.size ?? 0,
      byType,
    });
  }
  return result;
}

export const rate = (lost: number, expected: number) => (expected > 0 ? lost / expected : null);

/* ----------------------------------------------------------------------------
 * Períodos de empleo (altas, bajas y dotación a una fecha)
 * ------------------------------------------------------------------------- */

export type EmploymentPeriod = { start: Date; end: Date | null; rehire: boolean };

/** "dd/mm/aaaa" (como se guarda en el historial) → fecha de calendario. */
export function parseDisplayDate(value: string | null): Date | null {
  const match = value?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1]))) : null;
}

/**
 * Reconstruye los períodos trabajados de una persona: el ingreso actual, los
 * ingresos anteriores que guardan los reingresos y los egresos confirmados.
 * Cada egreso cierra el período en el que cae.
 */
export function employmentPeriods(input: {
  hireDate: Date;
  /** Ingresos anteriores (valor previo de `hireDate` en cada reingreso). */
  previousHires: Date[];
  exits: Date[];
}): EmploymentPeriod[] {
  const starts = [...new Set([...input.previousHires, input.hireDate].map((d) => d.getTime()))]
    .sort((a, b) => a - b)
    .map((t) => new Date(t));
  const exits = [...input.exits].sort((a, b) => a.getTime() - b.getTime());
  return starts.map((start, i) => {
    const next = starts[i + 1];
    const end = exits.find((x) => x >= start && (!next || x < next)) ?? null;
    return { start, end, rehire: i > 0 };
  });
}

export const employedOn = (periods: EmploymentPeriod[], date: Date) =>
  periods.some((p) => p.start <= date && (p.end === null || p.end >= date));

/* ----------------------------------------------------------------------------
 * Rangos de antigüedad
 * ------------------------------------------------------------------------- */

export type SeniorityRange = { label: string; from: number; to: number | null };

/** Límites en años (los 0 se ignoran) → rangos "Menos de 1 año", "De 1 a menos de 5 años", "20 años o más". */
export function seniorityRanges(limits: number[]): SeniorityRange[] {
  const bounds = limits.filter((n) => n > 0);
  const years = (n: number) => (n === 1 ? "1 año" : `${n} años`);
  const ranges: SeniorityRange[] = [];
  let from = 0;
  for (const to of bounds) {
    ranges.push({ label: from === 0 ? `Menos de ${years(to)}` : `De ${from} a menos de ${years(to)}`, from, to });
    from = to;
  }
  ranges.push({ label: from === 0 ? "Todas" : `${years(from)} o más`, from, to: null });
  return ranges;
}

export function rangeOf(ranges: SeniorityRange[], years: number): SeniorityRange {
  return ranges.find((r) => years >= r.from && (r.to === null || years < r.to)) ?? ranges.at(-1)!;
}

/* ----------------------------------------------------------------------------
 * Varios
 * ------------------------------------------------------------------------- */

/** Cuenta por etiqueta, de mayor a menor. */
export function countBy<T>(items: T[], label: (item: T) => string): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(label(item), (counts.get(label(item)) ?? 0) + 1);
  return [...counts]
    .map(([l, count]) => ({ label: l, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "es"));
}

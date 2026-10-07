import { countDays, isoKey, isoWeekday } from "@/features/leaves/days";

/*
 * Cálculos puros del inicio. Fechas de calendario en UTC.
 */

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
  /** Licencias aprobadas de tipos que cuentan para ausentismo. */
  leaves: { employeeId: string; startDate: Date; endDate: Date }[];
};

const max = (a: Date, b: Date) => (a > b ? a : b);
const min = (a: Date, b: Date) => (a < b ? a : b);

/**
 * Ausentismo del período: días de trabajo perdidos sobre días de trabajo
 * previstos. Solo cuentan los días hábiles de cada persona (su horario,
 * sin feriados) dentro de su período de empleo. Un día no se cuenta dos veces.
 */
export function absenteeism(input: AbsenceInput) {
  let expected = 0;
  const lost = new Set<string>();
  const byId = new Map(input.employees.map((e) => [e.id, e]));
  const windowOf = (e: AbsenceEmployee) => ({
    from: max(input.start, e.hireDate),
    to: e.exitDate ? min(input.end, e.exitDate) : input.end,
  });
  const isWorkDay = (e: AbsenceEmployee, date: Date) => {
    const { from, to } = windowOf(e);
    return date >= from && date <= to && e.workDays.has(isoWeekday(date)) && !input.holidays.has(isoKey(date));
  };

  for (const e of input.employees) {
    const { from, to } = windowOf(e);
    expected += countDays(from, to, "HABILES", e.workDays, input.holidays);
  }
  for (const a of input.absentDays) {
    const e = byId.get(a.employeeId);
    if (e && isWorkDay(e, a.date)) lost.add(`${e.id}:${isoKey(a.date)}`);
  }
  for (const l of input.leaves) {
    const e = byId.get(l.employeeId);
    if (!e) continue;
    for (let t = max(l.startDate, input.start).getTime(); t <= min(l.endDate, input.end).getTime(); t += 86_400_000) {
      const date = new Date(t);
      if (isWorkDay(e, date)) lost.add(`${e.id}:${isoKey(date)}`);
    }
  }
  const people = new Set([...lost].map((k) => k.split(":")[0]));
  return { expected, lost: lost.size, people: people.size, rate: expected > 0 ? lost.size / expected : null };
}

/** Años con un decimal entre dos fechas (antigüedad promedio). */
export function yearsBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (365.25 * 86_400_000);
}

/** Agrupa y ordena de mayor a menor; los nombres iguales se suman. */
export function distribution(labels: string[]): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  return [...counts]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "es"));
}

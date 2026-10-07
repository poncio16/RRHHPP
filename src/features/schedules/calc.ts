/** Cálculos de horarios (funciones puras, sin dependencias del servidor). */

export const DAY_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"] as const;
export const DAY_SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;

export function parseTime(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** Un turno que termina a la misma hora o antes de empezar cruza la medianoche. */
export function crossesMidnight(start: string, end: string): boolean {
  const s = parseTime(start);
  const e = parseTime(end);
  return s !== null && e !== null && e <= s;
}

/** Minutos trabajados en el día: de entrada a salida (cruzando la medianoche si hace falta) menos el descanso. */
export function workedMinutes(start: string, end: string, breakMinutes: number): number | null {
  const s = parseTime(start);
  const e = parseTime(end);
  if (s === null || e === null || s === e) return null;
  const span = e > s ? e - s : 24 * 60 - s + e;
  return span - breakMinutes;
}

/** Horas semanales con dos decimales, a partir de los días del horario. */
export function weeklyHours(days: { startTime: string; endTime: string; breakMinutes: number }[]): string {
  const minutes = days.reduce((total, d) => total + (workedMinutes(d.startTime, d.endTime, d.breakMinutes) ?? 0), 0);
  return (Math.round((minutes / 60) * 100) / 100).toFixed(2);
}

/**
 * Resumen legible de los días: agrupa días consecutivos con el mismo horario.
 * Ej.: "Lun a Vie 09:00–18:00 · Sáb 09:00–13:00".
 */
export function summarizeDays(days: { dayOfWeek: number; startTime: string; endTime: string }[]): string {
  const sorted = [...days].sort((a, b) => a.dayOfWeek - b.dayOfWeek);
  const groups: { from: number; to: number; range: string }[] = [];
  for (const day of sorted) {
    const range = `${day.startTime}–${day.endTime}`;
    const last = groups.at(-1);
    if (last && last.range === range && last.to === day.dayOfWeek - 1) last.to = day.dayOfWeek;
    else groups.push({ from: day.dayOfWeek, to: day.dayOfWeek, range });
  }
  return groups
    .map((g) => {
      const from = DAY_SHORT[g.from - 1];
      const label = g.from === g.to ? from : `${from} ${g.to - g.from === 1 ? "y" : "a"} ${DAY_SHORT[g.to - 1]}`;
      return `${label} ${g.range}`;
    })
    .join(" · ");
}

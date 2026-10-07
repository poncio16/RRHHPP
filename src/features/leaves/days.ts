/**
 * Conteo de días de licencias y vacaciones (funciones puras, usables en
 * cliente y servidor). Las fechas son de calendario: medianoche UTC.
 */

export type CountingMode = "CORRIDOS" | "HABILES";

const DAY = 86_400_000;

/** Día de la semana ISO: 1 = lunes … 7 = domingo. */
export function isoWeekday(date: Date): number {
  return ((date.getUTCDay() + 6) % 7) + 1;
}

/** Días hábiles por defecto: los primeros `count` días desde el lunes (5 = lunes a viernes). */
export function defaultWorkDays(count: number): Set<number> {
  return new Set(Array.from({ length: Math.min(Math.max(count, 0), 7) }, (_, i) => i + 1));
}

export function isoKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Días entre `start` y `end`, ambos inclusive. En días corridos cuenta todos;
 * en hábiles, solo los días de la semana que trabaja el empleado y que no son
 * feriado (`holidays` con claves AAAA-MM-DD).
 */
export function countDays(
  start: Date,
  end: Date,
  mode: CountingMode,
  workDays: ReadonlySet<number>,
  holidays: ReadonlySet<string>,
): number {
  if (end.getTime() < start.getTime()) return 0;
  const total = Math.round((end.getTime() - start.getTime()) / DAY) + 1;
  if (mode === "CORRIDOS") return total;
  let count = 0;
  for (let t = start.getTime(); t <= end.getTime(); t += DAY) {
    const day = new Date(t);
    if (workDays.has(isoWeekday(day)) && !holidays.has(isoKey(day))) count += 1;
  }
  return count;
}

/** Los rangos [aStart, aEnd] y [bStart, bEnd] (inclusive) comparten al menos un día. */
export function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() <= bEnd.getTime() && bStart.getTime() <= aEnd.getTime();
}

export type LeaveTiming = "PROXIMA" | "EN_CURSO" | "FINALIZADA";

/** "Vigente" y "finalizada" se derivan de las fechas (no se guardan). */
export function leaveTiming(start: Date, end: Date, today: Date): LeaveTiming {
  if (today.getTime() < start.getTime()) return "PROXIMA";
  if (today.getTime() > end.getTime()) return "FINALIZADA";
  return "EN_CURSO";
}

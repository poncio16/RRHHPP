/**
 * Fechas de calendario (nacimiento, ingreso, licencias…) se guardan como DATE
 * y llegan como Date a medianoche UTC: se formatean con componentes UTC para
 * que nunca se corran un día. Los instantes (TIMESTAMPTZ) se muestran en la
 * zona horaria de la empresa.
 */

export const DEFAULT_TIMEZONE = "America/Argentina/Buenos_Aires";

const pad = (n: number, len = 2) => String(n).padStart(len, "0");

/** Date (medianoche UTC) → "DD/MM/AAAA". */
export function formatDate(date: Date | null | undefined): string {
  if (!date) return "";
  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
}

/** Instante → "DD/MM/AAAA HH:mm" en la zona horaria indicada. */
export function formatDateTime(instant: Date | null | undefined, timeZone = DEFAULT_TIMEZONE): string {
  if (!instant) return "";
  const parts = new Intl.DateTimeFormat("es-AR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
}

/** "DD/MM/AAAA" → Date a medianoche UTC, o null si no es una fecha real. */
export function parseDate(value: string): Date | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [, d, m, y] = match.map(Number) as [number, number, number, number];
  return makeDate(y, m, d);
}

/** "AAAA-MM-DD" (input type=date, ISO) → Date a medianoche UTC, o null. */
export function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  return makeDate(y, m, d);
}

/** Date → "AAAA-MM-DD" usando componentes UTC. */
export function toIsoDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Fecha de calendario de "hoy" en la zona horaria indicada, a medianoche UTC. */
export function todayInTimeZone(timeZone = DEFAULT_TIMEZONE, now = new Date()): Date {
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    now,
  );
  return parseIsoDate(iso)!;
}

function makeDate(year: number, month: number, day: number): Date | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return valid ? date : null;
}

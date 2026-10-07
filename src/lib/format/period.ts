/**
 * Períodos mensuales (liquidación, novedades): se guardan como el primer día
 * del mes (`DATE`, medianoche UTC) y se escriben "AAAA-MM" en la URL y los
 * formularios.
 */

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

/** "2025-03" → 1/3/2025, o null si no es un período válido. */
export function parsePeriod(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < 1900 || year > 2999 || month < 1 || month > 12) return null;
  return new Date(Date.UTC(year, month - 1, 1));
}

/** Primer día del mes de una fecha. */
export function periodOf(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/** 1/3/2025 → "2025-03". */
export function periodKey(period: Date): string {
  return period.toISOString().slice(0, 7);
}

/** 1/3/2025 → "marzo de 2025". */
export function formatPeriod(period: Date | null | undefined): string {
  if (!period) return "";
  return `${MONTHS[period.getUTCMonth()]} de ${period.getUTCFullYear()}`;
}

/** Último día del mes del período. */
export function periodEnd(period: Date): Date {
  return new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth() + 1, 0));
}

/** El período `n` meses después (o antes, si es negativo). */
export function addMonths(period: Date, n: number): Date {
  return new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth() + n, 1));
}

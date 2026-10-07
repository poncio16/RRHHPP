/** Estado de vencimiento de un documento (funciones puras, usables en cliente y servidor). */

export type ExpiryState = "SIN_VENCIMIENTO" | "VIGENTE" | "POR_VENCER" | "VENCIDO";

const DAY = 86_400_000;

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY);
}

/** Días desde `today` hasta el vencimiento (negativo si ya venció). Fechas de calendario en UTC. */
export function daysUntil(expiry: Date, today: Date): number {
  return Math.round((expiry.getTime() - today.getTime()) / DAY);
}

/**
 * Un documento es válido hasta su fecha de vencimiento inclusive. Está "por
 * vencer" cuando faltan `alertDays` días o menos.
 */
export function expiryState(expiry: Date | null, today: Date, alertDays: number): ExpiryState {
  if (!expiry) return "SIN_VENCIMIENTO";
  const days = daysUntil(expiry, today);
  if (days < 0) return "VENCIDO";
  if (days <= alertDays) return "POR_VENCER";
  return "VIGENTE";
}

/** Vencimiento sugerido a partir de la emisión y la vigencia habitual del tipo. */
export function suggestedExpiry(issue: Date, validityDays: number): Date {
  return addDays(issue, validityDays);
}

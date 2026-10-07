/** Cálculos del legajo (funciones puras, usables en cliente y servidor). */

export type Seniority = { years: number; months: number; days: number };

/** Suma meses a una fecha UTC; si el día no existe en el mes destino, usa el último día. */
function addMonthsClamped(date: Date, months: number): Date {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return target;
}

/**
 * Antigüedad entre dos fechas de calendario (medianoche UTC), en años, meses
 * y días cumplidos. Un mes se cumple el mismo día del mes siguiente, o el
 * último día si ese no existe (31/1 → 28/2). Si `to` es anterior a `from`
 * devuelve cero.
 */
export function seniority(from: Date, to: Date): Seniority {
  if (to.getTime() <= from.getTime()) return { years: 0, months: 0, days: 0 };
  let total = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  let anchor = addMonthsClamped(from, total);
  if (anchor.getTime() > to.getTime()) {
    total -= 1;
    anchor = addMonthsClamped(from, total);
  }
  const days = Math.round((to.getTime() - anchor.getTime()) / 86_400_000);
  return { years: Math.floor(total / 12), months: total % 12, days };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "3 años y 2 meses", "5 meses", "12 días". */
export function formatSeniority({ years, months, days }: Seniority): string {
  if (years === 0 && months === 0) return plural(days, "día", "días");
  const parts = [years > 0 ? plural(years, "año", "años") : null, months > 0 ? plural(months, "mes", "meses") : null];
  return parts.filter(Boolean).join(" y ");
}

/** Edad en años cumplidos. */
export function ageInYears(birthDate: Date, today: Date): number {
  return seniority(birthDate, today).years;
}

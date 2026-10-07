/**
 * Cálculo de los días de vacaciones de un período anual (funciones puras).
 * Las reglas y los criterios salen de Configuración (`VacationRule` y el
 * parámetro `leaves`); acá no hay valores legales.
 */
import { seniority, type Seniority } from "@/features/employees/calc";
import { countDays } from "@/features/leaves/days";

export type VacationRuleInput = { minSeniorityYears: number; maxSeniorityYears: number | null; days: number };

const isZero = (s: Seniority) => s.months === 0 && s.days === 0;

/** La antigüedad supera `years` años (exactamente `years` años no lo supera). */
function exceeds(s: Seniority, years: number): boolean {
  return s.years > years || (s.years === years && !isZero(s));
}

/**
 * Regla que corresponde a una antigüedad: "más de `min` años y hasta `max`
 * años inclusive". La regla que empieza en 0 incluye la antigüedad cero.
 */
export function matchRule<R extends VacationRuleInput>(s: Seniority, rules: readonly R[]): R | null {
  return (
    rules.find(
      (r) =>
        (r.minSeniorityYears === 0 || exceeds(s, r.minSeniorityYears)) &&
        (r.maxSeniorityYears === null || !exceeds(s, r.maxSeniorityYears)),
    ) ?? null
  );
}

/** Texto del rango: "Hasta 5 años", "Más de 5 y hasta 10 años", "Más de 20 años". */
export function ruleRangeLabel(rule: Pick<VacationRuleInput, "minSeniorityYears" | "maxSeniorityYears">): string {
  const { minSeniorityYears: min, maxSeniorityYears: max } = rule;
  if (min === 0 && max === null) return "Cualquier antigüedad";
  if (min === 0) return `Hasta ${max} ${max === 1 ? "año" : "años"}`;
  if (max === null) return `Más de ${min} ${min === 1 ? "año" : "años"}`;
  return `Más de ${min} y hasta ${max} años`;
}

/**
 * Las reglas cubren todas las antigüedades sin superponerse: la primera
 * empieza en 0, cada una empieza donde termina la anterior y solo la última
 * queda sin tope. Devuelve el primer problema o null.
 */
export function rulesProblem(rules: readonly VacationRuleInput[]): { index: number; message: string } | null {
  if (rules.length === 0) return { index: -1, message: "Cargá al menos una regla." };
  for (const [index, rule] of rules.entries()) {
    const expectedMin = index === 0 ? 0 : rules[index - 1]!.maxSeniorityYears;
    if (rule.minSeniorityYears !== expectedMin) {
      return {
        index,
        message:
          index === 0
            ? "La primera regla tiene que empezar en 0 años."
            : `Tiene que empezar en ${expectedMin} años, donde termina la anterior.`,
      };
    }
    const last = index === rules.length - 1;
    if (!last && rule.maxSeniorityYears === null) {
      return { index, message: "Solo la última regla puede quedar sin tope." };
    }
    if (last && rule.maxSeniorityYears !== null) {
      return { index, message: "La última regla tiene que quedar sin tope (vale para cualquier antigüedad mayor)." };
    }
    if (rule.maxSeniorityYears !== null && rule.maxSeniorityYears <= rule.minSeniorityYears) {
      return { index, message: "El tope tiene que ser mayor que el inicio." };
    }
  }
  return null;
}

/** Fecha de corte del período `year`; si el día no existe en ese mes, el último día del mes. */
export function cutoffDate(year: number, month: number, day: number): Date {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1, Math.min(day, lastDay)));
}

export type EntitlementParams = {
  year: number;
  cutoff: { month: number; day: number };
  /** Fecha de antigüedad reconocida. */
  seniorityDate: Date;
  /** Ingreso del período laboral actual (para los días trabajados en el año). */
  hireDate: Date;
  rules: readonly VacationRuleInput[];
  /** Porcentaje mínimo de días hábiles trabajados para el período completo (0 lo desactiva). */
  proportionalMinPercent: number;
  /** Con menos de ese mínimo: un día de vacaciones cada tantos días trabajados. */
  proportionalWorkedDays: number;
  workDays: ReadonlySet<number>;
  holidays: ReadonlySet<string>;
};

export type Entitlement = {
  cutoff: Date;
  seniority: Seniority;
  rule: VacationRuleInput | null;
  /** Días hábiles trabajados en los doce meses que terminan en el corte, y los del período completo. */
  workedDays: number;
  periodWorkDays: number;
  proportional: boolean;
  days: number;
};

/**
 * Días que corresponden en el período `year`, o null si al corte todavía no
 * había ingresado. Si trabajó menos del mínimo de días hábiles del período
 * se aplica la proporción configurada; si no, la regla por antigüedad.
 */
export function vacationEntitlement(p: EntitlementParams): Entitlement | null {
  const cutoff = cutoffDate(p.year, p.cutoff.month, p.cutoff.day);
  if (p.hireDate.getTime() > cutoff.getTime() || p.seniorityDate.getTime() > cutoff.getTime()) return null;

  const periodStart = new Date(Date.UTC(p.year - 1, cutoff.getUTCMonth(), cutoff.getUTCDate() + 1));
  const workedFrom = p.hireDate.getTime() > periodStart.getTime() ? p.hireDate : periodStart;
  const periodWorkDays = countDays(periodStart, cutoff, "HABILES", p.workDays, p.holidays);
  const workedDays = countDays(workedFrom, cutoff, "HABILES", p.workDays, p.holidays);
  const s = seniority(p.seniorityDate, cutoff);
  const rule = matchRule(s, p.rules);

  const proportional =
    p.proportionalMinPercent > 0 &&
    p.proportionalWorkedDays > 0 &&
    workedDays * 100 < periodWorkDays * p.proportionalMinPercent;
  const days = proportional ? Math.floor(workedDays / p.proportionalWorkedDays) : (rule?.days ?? 0);
  return { cutoff, seniority: s, rule, workedDays, periodWorkDays, proportional, days };
}

/*
 * Reglas puras de las alertas (fechas de calendario en UTC, sin zona).
 */

const DAY = 86_400_000;

export const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY);
export const daysBetween = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / DAY);

/**
 * Próximo cumpleaños a partir de hoy (incluido). Quien nació un 29 de
 * febrero lo festeja el 28 en los años no bisiestos.
 */
export function nextBirthday(birthDate: Date, today: Date): Date {
  const month = birthDate.getUTCMonth();
  const day = birthDate.getUTCDate();
  const on = (year: number) => {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return new Date(Date.UTC(year, month, month === 1 && day === 29 && !leap ? 28 : day));
  };
  const year = today.getUTCFullYear();
  const thisYear = on(year);
  return thisYear >= today ? thisYear : on(year + 1);
}

/** Edad que se cumple en `birthday`. */
export const ageOn = (birthDate: Date, birthday: Date) => birthday.getUTCFullYear() - birthDate.getUTCFullYear();

export type LegajoFields = {
  workScheduleId: string | null;
  healthInsurerId: string | null;
  artProviderId: string | null;
  phone: string | null;
  email: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  hasBankAccount: boolean;
  hasSalary: boolean;
};

/** Qué datos puede revisar quien mira (los personales, bancarios y salariales dependen de permisos). */
export type LegajoScope = { personal: boolean; bank: boolean; salary: boolean };

export const MISSING_LABELS = {
  HORARIO: "horario",
  OBRA_SOCIAL: "obra social",
  ART: "ART",
  CONTACTO: "teléfono o email",
  EMERGENCIA: "contacto de emergencia",
  CUENTA_SUELDO: "cuenta sueldo",
  BASICO: "sueldo básico",
} as const;
export type MissingItem = keyof typeof MISSING_LABELS;

/** Datos que le faltan a un legajo activo, en orden fijo. */
export function missingItems(e: LegajoFields, scope: LegajoScope): MissingItem[] {
  const missing: MissingItem[] = [];
  if (!e.workScheduleId) missing.push("HORARIO");
  if (!e.healthInsurerId) missing.push("OBRA_SOCIAL");
  if (!e.artProviderId) missing.push("ART");
  if (scope.personal) {
    if (!e.phone && !e.email) missing.push("CONTACTO");
    if (!e.emergencyContactName || !e.emergencyContactPhone) missing.push("EMERGENCIA");
  }
  if (scope.bank && !e.hasBankAccount) missing.push("CUENTA_SUELDO");
  if (scope.salary && !e.hasSalary) missing.push("BASICO");
  return missing;
}

/** "Faltan horario, ART y cuenta sueldo." */
export function missingText(items: MissingItem[]): string {
  const labels = items.map((i) => MISSING_LABELS[i]);
  const list = labels.length > 1 ? `${labels.slice(0, -1).join(", ")} y ${labels.at(-1)}` : labels[0];
  return `${items.length > 1 ? "Faltan" : "Falta"} ${list}.`;
}

/** "Hoy", "Mañana", "En 5 días", "Hace 3 días". */
export function relativeDays(days: number): string {
  if (days === 0) return "Hoy";
  if (days === 1) return "Mañana";
  if (days === -1) return "Ayer";
  return days > 0 ? `En ${days} días` : `Hace ${-days} días`;
}

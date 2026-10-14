/**
 * Documentos obligatorios (funciones puras): qué le falta a un legajo según
 * lo marcado en el catálogo. Los de "una vez" faltan si no hay ninguno; los
 * mensuales (por ejemplo, el recibo de sueldo), por cada mes sin el suyo desde
 * el mes en que se empieza a controlar o el de ingreso, el que sea posterior.
 * Cuenta como cargado cualquier documento del tipo que no esté anulado, aunque
 * esté pendiente, observado o vencido: esos casos ya tienen su propio aviso.
 */

import { addMonths, formatPeriod, periodKey, periodOf } from "@/lib/format";
import type { DocumentRequirement } from "./constants";
import { addDays } from "./expiry";

export type RequiredType = {
  id: string;
  name: string;
  requirement: DocumentRequirement;
  requiredFrom: Date | null;
};

export type LoadedDocument = { documentTypeId: string; period: Date | null };

/** Un tipo que falta; en los mensuales, con los meses sin cargar (del más viejo al más nuevo). */
export type MissingDocument = { typeId: string; name: string; months: Date[] };

/**
 * Último mes que ya tendría que estar cargado: un mes se reclama cuando
 * pasaron `graceDays` días desde su último día.
 */
export function lastDueMonth(today: Date, graceDays: number): Date {
  return addMonths(periodOf(addDays(today, -graceDays)), -1);
}

/** Meses a controlar, de `from` (o del ingreso, si es posterior) a `lastDue`. */
export function dueMonths(from: Date, hireDate: Date, lastDue: Date): Date[] {
  const start = periodOf(from > hireDate ? from : hireDate);
  const months: Date[] = [];
  for (let month = start; month <= lastDue; month = addMonths(month, 1)) months.push(month);
  return months;
}

/** Lo que le falta a un legajo, en el orden de `types`. */
export function missingDocuments(
  types: readonly RequiredType[],
  loaded: readonly LoadedDocument[],
  hireDate: Date,
  lastDue: Date,
): MissingDocument[] {
  const missing: MissingDocument[] = [];
  for (const type of types) {
    const own = loaded.filter((d) => d.documentTypeId === type.id);
    if (type.requirement === "UNA_VEZ") {
      if (own.length === 0) missing.push({ typeId: type.id, name: type.name, months: [] });
      continue;
    }
    // Sin mes de inicio no hay desde dónde controlar (el catálogo lo exige al marcarlo).
    if (!type.requiredFrom) continue;
    const loadedMonths = new Set(own.flatMap((d) => (d.period ? [periodKey(d.period)] : [])));
    const months = dueMonths(type.requiredFrom, hireDate, lastDue).filter((m) => !loadedMonths.has(periodKey(m)));
    if (months.length > 0) missing.push({ typeId: type.id, name: type.name, months });
  }
  return missing;
}

const monthName = (month: Date) => formatPeriod(month).replace(/ de \d{4}$/, "");

/** "julio y agosto de 2026", o "julio de 2025 y enero de 2026" si cambian de año. */
function listMonths(months: readonly Date[]): string {
  const sameYear = months.every((m) => m.getUTCFullYear() === months[0]!.getUTCFullYear());
  const names = sameYear ? months.map(monthName) : months.map(formatPeriod);
  const list = names.length === 1 ? names[0]! : `${names.slice(0, -1).join(", ")} y ${names.at(-1)}`;
  return sameYear ? `${list} de ${months[0]!.getUTCFullYear()}` : list;
}

/** "DNI", "Recibo de sueldo: agosto y septiembre de 2026" o "Recibo de sueldo: 5 meses entre …". */
export function describeMissing(item: MissingDocument): string {
  const { name, months } = item;
  if (months.length === 0) return name;
  if (months.length <= 3) return `${name}: ${listMonths(months)}`;
  return `${name}: ${months.length} meses entre ${formatPeriod(months[0])} y ${formatPeriod(months.at(-1))}`;
}

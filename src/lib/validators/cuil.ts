import { onlyDigits } from "./digits";

const WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const;

/** Prefijos de personas humanas (CUIL). */
export const PERSON_PREFIXES = ["20", "23", "24", "27"] as const;
/** Prefijos de personas jurídicas (CUIT). */
export const COMPANY_PREFIXES = ["30", "33", "34"] as const;

export function normalizeCuil(value: string): string {
  return onlyDigits(value);
}

/** Dígito verificador módulo 11. Devuelve null si el cálculo da 10 (combinación inválida). */
export function cuilCheckDigit(firstTen: string): number | null {
  const sum = WEIGHTS.reduce((acc, weight, i) => acc + weight * Number(firstTen[i]), 0);
  const result = 11 - (sum % 11);
  if (result === 11) return 0;
  if (result === 10) return null;
  return result;
}

function isValidWithPrefixes(value: string, prefixes: readonly string[]): boolean {
  const digits = normalizeCuil(value);
  if (!/^[0-9]{11}$/.test(digits)) return false;
  if (!prefixes.includes(digits.slice(0, 2))) return false;
  return cuilCheckDigit(digits.slice(0, 10)) === Number(digits[10]);
}

/** CUIL de una persona humana. */
export function isValidCuil(value: string): boolean {
  return isValidWithPrefixes(value, PERSON_PREFIXES);
}

/** CUIT de persona humana o jurídica. */
export function isValidCuit(value: string): boolean {
  return isValidWithPrefixes(value, [...PERSON_PREFIXES, ...COMPANY_PREFIXES]);
}

/** Los 8 dígitos centrales del CUIL, comparables con el DNI. */
export function cuilMatchesDni(cuil: string, dni: string): boolean {
  return normalizeCuil(cuil).slice(2, 10) === onlyDigits(dni).padStart(8, "0");
}

/** "20123456786" → "20-12345678-6" */
export function formatCuil(value: string): string {
  const d = normalizeCuil(value);
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : value;
}

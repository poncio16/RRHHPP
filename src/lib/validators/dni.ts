import { onlyDigits } from "./digits";

/** Normaliza un DNI ("12.345.678" → "12345678"). */
export function normalizeDni(value: string): string {
  return onlyDigits(value);
}

/** DNI argentino: 7 u 8 dígitos, sin ceros a la izquierda. */
export function isValidDni(value: string): boolean {
  return /^[1-9][0-9]{6,7}$/.test(normalizeDni(value));
}

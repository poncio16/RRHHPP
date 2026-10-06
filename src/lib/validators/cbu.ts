import { onlyDigits } from "./digits";

const BLOCK1_WEIGHTS = [7, 1, 3, 9, 7, 1, 3] as const;
const BLOCK2_WEIGHTS = [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3] as const;

function checkDigit(digits: string, weights: readonly number[]): number {
  const sum = weights.reduce((acc, weight, i) => acc + weight * Number(digits[i]), 0);
  return (10 - (sum % 10)) % 10;
}

export function normalizeCbu(value: string): string {
  return onlyDigits(value);
}

/** CBU: 22 dígitos con los dos dígitos verificadores del BCRA. */
export function isValidCbu(value: string): boolean {
  const d = normalizeCbu(value);
  if (!/^[0-9]{22}$/.test(d)) return false;
  const block1 = d.slice(0, 8);
  const block2 = d.slice(8);
  return (
    checkDigit(block1, BLOCK1_WEIGHTS) === Number(block1[7]) &&
    checkDigit(block2, BLOCK2_WEIGHTS) === Number(block2[13])
  );
}

/** Código de banco (3 primeros dígitos). */
export function cbuBankCode(value: string): string {
  return normalizeCbu(value).slice(0, 3);
}

/** Muestra solo los últimos 4 dígitos. */
export function maskCbu(value: string): string {
  const d = normalizeCbu(value);
  return d.length >= 4 ? `****${d.slice(-4)}` : "****";
}

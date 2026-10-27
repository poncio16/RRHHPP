import { fromCents, toCents } from "@/lib/validators/decimal";

/*
 * Cálculos de la cuenta corriente sin acceso a datos: huella de un movimiento
 * (para descartar repetidos) y saldo acumulado.
 */

/**
 * Clave de un movimiento: empleado, fecha e importes. El concepto no cuenta,
 * porque cada planilla puede escribirlo distinto. Importes como "1234.50".
 */
export function entryKey(employeeId: string, isoDate: string, credit: string, debit: string): string {
  return `${employeeId}|${isoDate}|${fromCents(toCents(credit))}|${fromCents(toCents(debit))}`;
}

/**
 * Huellas de los movimientos de una planilla, en orden: la clave y cuántas
 * veces apareció hasta ahí. Dos retiros iguales el mismo día son "|1" y "|2";
 * la planilla del año siguiente, que arrastra los mismos dos, da las mismas
 * huellas y no los vuelve a cargar.
 */
export function fingerprints(keys: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return keys.map((key) => {
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return `${key}|${n}`;
  });
}

type Movement = {
  credit: { toString(): string };
  debit: { toString(): string };
  voided: boolean;
  /** Saldo que trae la planilla: fija el saldo en ese punto en lugar de sumar. */
  isBalance?: boolean;
};

/**
 * Saldo después de cada movimiento (ingresos menos retiros), partiendo de
 * `opening`. Los anulados no suman y quedan sin saldo. Un saldo de la
 * planilla fija el saldo y `adjustment` es la diferencia con el que venía
 * (cero si coincide; distinto si faltan movimientos de años anteriores).
 * Los movimientos van en orden cronológico.
 */
export function runningBalance<T extends Movement>(items: readonly T[], opening = "0.00") {
  let cents = toCents(opening);
  const rows = items.map((item) => {
    if (item.voided) return { ...item, balance: null, adjustment: null };
    const amount = toCents(item.credit) - toCents(item.debit);
    if (item.isBalance) {
      const adjustment = amount - cents;
      cents = amount;
      return { ...item, balance: fromCents(cents), adjustment: fromCents(adjustment) };
    }
    cents += amount;
    return { ...item, balance: fromCents(cents), adjustment: null };
  });
  return { rows, closing: fromCents(cents) };
}

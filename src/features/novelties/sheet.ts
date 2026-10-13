/**
 * Columnas de novedades de la planilla para el contador (funciones puras):
 * cada tipo marcado en el catálogo suma, por empleado, su cantidad, su
 * importe o las dos; si no pide ninguna, cuenta las novedades.
 */
import type { Column } from "@/features/reports/table";
import { fromCents, toCents } from "@/lib/validators/decimal";

export type SheetType = {
  id: string;
  name: string;
  requiresAmount: boolean;
  requiresQuantity: boolean;
  quantityUnit: string | null;
  /** Tipos de licencia que generan novedades de este tipo: informan los días aunque el tipo no pida cantidad. */
  linkedLeaveTypes: number;
};

export type SheetMeasure = "quantity" | "amount" | "count";

export type SheetNovelty = {
  employeeId: string;
  noveltyTypeId: string;
  quantity: { toString(): string } | null;
  amount: { toString(): string } | null;
};

export function measuresOf(type: SheetType): SheetMeasure[] {
  const measures: SheetMeasure[] = [];
  if (type.requiresQuantity || type.linkedLeaveTypes > 0) measures.push("quantity");
  if (type.requiresAmount) measures.push("amount");
  return measures.length > 0 ? measures : ["count"];
}

const columnKey = (measure: SheetMeasure, typeId: string) => `${measure}:${typeId}`;

/** Una columna por tipo (dos si pide cantidad e importe), en el orden recibido. */
export function noveltyColumns(types: readonly SheetType[]): Column[] {
  return types.flatMap((type) => {
    const measures = measuresOf(type);
    return measures.map((measure): Column => ({
      key: columnKey(measure, type.id),
      label:
        measures.length === 1
          ? type.name
          : measure === "quantity"
            ? `${type.name} (${type.quantityUnit || "cantidad"})`
            : `${type.name} ($)`,
      type: measure === "amount" ? "money" : measure === "quantity" ? "decimal" : "int",
    }));
  });
}

/**
 * Totales de cada empleado en las columnas de novedades; las columnas sin
 * novedades quedan en 0, como en una planilla completa a mano. Suma en
 * centavos para no arrastrar errores de punto flotante.
 */
export function noveltyTotals(
  columns: readonly Column[],
  novelties: readonly SheetNovelty[],
): (employeeId: string) => Record<string, number> {
  const sums = new Map<string, Map<string, bigint>>();
  for (const novelty of novelties) {
    const own = sums.get(novelty.employeeId) ?? new Map<string, bigint>();
    sums.set(novelty.employeeId, own);
    const add = (measure: SheetMeasure, value: bigint) => {
      const key = columnKey(measure, novelty.noveltyTypeId);
      own.set(key, (own.get(key) ?? 0n) + value);
    };
    add("quantity", toCents(novelty.quantity));
    add("amount", toCents(novelty.amount));
    add("count", 1n);
  }
  return (employeeId) => {
    const own = sums.get(employeeId);
    return Object.fromEntries(
      columns.map((c) => {
        const value = own?.get(c.key) ?? 0n;
        return [c.key, c.type === "int" ? Number(value) : Number(fromCents(value))];
      }),
    );
  };
}

/**
 * Valores de referencia del legajo a una fecha: para cada campo, el valor
 * anterior del primer cambio con fecha efectiva posterior (en orden) o, si no
 * hubo ninguno, el actual.
 */
export function valuesAt<F extends string>(
  current: Record<F, string | null>,
  laterChanges: readonly { field: string; oldRefId: string | null }[],
): Record<F, string | null> {
  const result = { ...current };
  const seen = new Set<string>();
  for (const change of laterChanges) {
    if (seen.has(change.field) || !(change.field in current)) continue;
    seen.add(change.field);
    result[change.field as F] = change.oldRefId;
  }
  return result;
}

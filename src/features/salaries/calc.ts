import { formatMoney } from "@/lib/format";
import { sumAmounts, toCents } from "@/lib/validators/decimal";
import type { ConceptNature } from "./constants";

type Amount = { toString(): string };

/**
 * Controles blandos de un resumen informado: el dato viene del sistema de
 * liquidación, así que las diferencias se avisan pero no impiden guardarlo.
 */
export function payrollWarnings(record: {
  gross: Amount;
  deductions: Amount;
  net: Amount;
  lines: { nature: ConceptNature; amount: Amount }[];
}): string[] {
  const warnings: string[] = [];
  const expectedNet = toCents(record.gross) - toCents(record.deductions);
  if (expectedNet !== toCents(record.net)) {
    warnings.push(
      `El bruto menos los descuentos da ${formatMoney(Number(expectedNet) / 100)} y el neto informado es ${formatMoney(record.net)}.`,
    );
  }
  if (record.lines.length > 0) {
    const sum = (nature: ConceptNature) =>
      sumAmounts(record.lines.filter((l) => l.nature === nature).map((l) => l.amount));
    const haberes = sum("HABER");
    if (toCents(haberes) !== toCents(record.gross)) {
      warnings.push(
        `Los haberes de los renglones suman ${formatMoney(haberes)} y el bruto informado es ${formatMoney(record.gross)}.`,
      );
    }
    const descuentos = sum("DESCUENTO");
    if (toCents(descuentos) !== toCents(record.deductions)) {
      warnings.push(
        `Los descuentos de los renglones suman ${formatMoney(descuentos)} y los descuentos informados son ${formatMoney(record.deductions)}.`,
      );
    }
  }
  return warnings;
}

/** Variación porcentual entre dos básicos, con un decimal ("12,5 %"), o null si no hay anterior. */
export function salaryVariation(previous: Amount | null, current: Amount): string | null {
  if (previous === null || toCents(previous) === 0n) return null;
  const change = (Number(toCents(current) - toCents(previous)) / Number(toCents(previous))) * 100;
  return `${change > 0 ? "+" : ""}${change.toFixed(1).replace(".", ",")} %`;
}

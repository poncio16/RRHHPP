const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Amount = number | string | { toString(): string };

/** 1234567.89 → "$ 1.234.567,89". Acepta number, string o Prisma.Decimal. */
export function formatMoney(value: Amount | null | undefined): string {
  if (value === null || value === undefined) return "";
  // Intl usa un espacio duro entre el signo y el número: se normaliza a espacio común.
  return currencyFormatter.format(Number(value.toString())).replace(/ /g, " ");
}

/** 1234567.89 → "1.234.567,89" */
export function formatAmount(value: Amount | null | undefined): string {
  if (value === null || value === undefined) return "";
  return numberFormatter.format(Number(value.toString()));
}

/** "1.234.567,89" → "1234567.89" (string decimal para Prisma), o null si no es un importe. */
export function parseAmount(value: string): string | null {
  const cleaned = value.replace(/[$\s]/g, "").replace(/\./g, "").replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return cleaned;
}

const integerFormatter = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const decimalFormatter = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** 1234 → "1.234" */
export function formatInteger(value: number): string {
  return integerFormatter.format(value);
}

/** 0.0523 → "5,2 %" */
export function formatPercent(ratio: number): string {
  return `${decimalFormatter.format(ratio * 100)} %`;
}

/** 4.25 → "4,3" (un decimal) */
export function formatDecimal(value: number): string {
  return decimalFormatter.format(value);
}

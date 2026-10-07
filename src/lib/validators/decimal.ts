/**
 * Importes y cantidades escritos a mano: "1.234,56", "1234,56" o "1234.56".
 * Con coma, los puntos son separadores de miles; sin coma, un punto seguido
 * de uno o dos dígitos al final es el separador decimal ("1.234" son mil
 * doscientos treinta y cuatro).
 */
export function normalizeDecimal(value: string, maxIntegerDigits = 12): string | null {
  let text = value.replace(/[$\s]/g, "");
  if (text === "") return null;
  if (text.includes(",")) {
    if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(text)) return null;
    text = text.replace(/\./g, "").replace(",", ".");
  } else if (/^\d+\.\d{1,2}$/.test(text)) {
    // Punto decimal: se deja como está.
  } else if (/^\d{1,3}(\.\d{3})+$|^\d+$/.test(text)) {
    text = text.replace(/\./g, "");
  } else {
    return null;
  }
  const [integer = "", decimals = ""] = text.split(".");
  const trimmed = integer.replace(/^0+(?=\d)/, "");
  if (trimmed.length > maxIntegerDigits) return null;
  return `${trimmed}.${decimals.padEnd(2, "0")}`;
}

/** "1234.50" → "1234,50": valor para un campo de formulario (sin separador de miles). */
export function decimalInput(value: { toString(): string } | null | undefined): string {
  if (value === null || value === undefined) return "";
  return Number(value.toString()).toFixed(2).replace(".", ",");
}

/** Suma exacta de importes con dos decimales (en centavos, sin errores de coma flotante). */
export function sumAmounts(values: readonly ({ toString(): string } | null | undefined)[]): string {
  const cents = values.reduce<bigint>((acc, v) => acc + toCents(v), 0n);
  return fromCents(cents);
}

export function toCents(value: { toString(): string } | null | undefined): bigint {
  if (value === null || value === undefined) return 0n;
  const [integer = "0", decimals = ""] = value.toString().split(".");
  const negative = integer.startsWith("-");
  const abs = BigInt(integer.replace("-", "")) * 100n + BigInt((decimals + "00").slice(0, 2));
  return negative ? -abs : abs;
}

export function fromCents(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  return `${negative ? "-" : ""}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
}

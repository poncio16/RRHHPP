/** Quita puntos, guiones y espacios. */
export function onlyDigits(value: string): string {
  return value.replace(/[\s.\-]/g, "");
}

import { maskCbu } from "@/lib/validators/cbu";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** Campos que nunca se guardan en la auditoría. */
const OMITTED = new Set(["passwordHash", "password", "tokenHash", "token"]);
/** Campos que se guardan enmascarados. */
const MASKERS: Record<string, (value: string) => string> = { cbu: maskCbu };
/** Campos técnicos que no aportan a un diff. */
const IGNORED_IN_DIFF = new Set(["updatedAt", "createdAt", "version", "updatedById", "createdById"]);

/** Convierte un valor a JSON apto para auditoría (fechas ISO, Decimal como texto). */
function toJson(value: unknown): Json {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(toJson);
  if (typeof value === "object") {
    // Prisma.Decimal y similares
    if ("toFixed" in value && typeof (value as { toString: unknown }).toString === "function") return String(value);
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toJson(v)]));
  }
  return String(value);
}

/** Copia del registro sin campos secretos y con los sensibles enmascarados. */
export function sanitizeForAudit(record: Record<string, unknown>): Record<string, Json> {
  const result: Record<string, Json> = {};
  for (const [key, value] of Object.entries(record)) {
    if (OMITTED.has(key)) continue;
    const masker = MASKERS[key];
    result[key] = masker && typeof value === "string" ? masker(value) : toJson(value);
  }
  return result;
}

/**
 * Diff entre dos versiones de un registro: devuelve solo los campos que
 * cambiaron, ya sanitizados. Null si no hubo cambios relevantes.
 */
export function auditDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { before: Record<string, Json>; after: Record<string, Json> } | null {
  const b = sanitizeForAudit(before);
  const a = sanitizeForAudit(after);
  const changedBefore: Record<string, Json> = {};
  const changedAfter: Record<string, Json> = {};
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  for (const key of keys) {
    if (IGNORED_IN_DIFF.has(key)) continue;
    if (JSON.stringify(b[key] ?? null) !== JSON.stringify(a[key] ?? null)) {
      changedBefore[key] = b[key] ?? null;
      changedAfter[key] = a[key] ?? null;
    }
  }
  // Un secreto cambiado (p. ej. contraseña) no aparece en el diff: se registra el hecho.
  for (const key of OMITTED) {
    if (key in before && key in after && before[key] !== after[key]) {
      changedBefore[key] = "[oculto]";
      changedAfter[key] = "[modificado]";
    }
  }
  return Object.keys(changedAfter).length > 0 ? { before: changedBefore, after: changedAfter } : null;
}

export type { Json as AuditJson };

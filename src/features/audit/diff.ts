import { formatDate, formatDateTime } from "@/lib/format";
import { FIELD_LABELS } from "./constants";

/*
 * Antes y después de un evento como filas legibles. Los valores llegan como
 * JSON (fechas en ISO, importes como texto); IDs y valores técnicos se
 * muestran tal cual.
 */

export type DiffRow = { field: string; label: string; before: string | null; after: string | null; changed: boolean };

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function formatAuditValue(value: Json | undefined): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    if (ISO_DATE.test(value)) return formatDate(new Date(`${value}T00:00:00.000Z`));
    if (!ISO_INSTANT.test(value)) return value;
    const date = new Date(value);
    // Las fechas de calendario se guardan a medianoche UTC.
    return value.endsWith("T00:00:00.000Z") ? formatDate(date) : formatDateTime(date);
  }
  if (Array.isArray(value)) {
    return value.every((v) => typeof v !== "object" || v === null)
      ? value.map((v) => formatAuditValue(v) ?? "—").join(", ")
      : JSON.stringify(value);
  }
  return JSON.stringify(value);
}

const asObject = (value: unknown): Record<string, Json> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, Json>) : null;

/**
 * Filas campo por campo. En un alta solo hay "después"; en una modificación,
 * los campos que cambiaron. Un valor que no es un objeto se muestra en una
 * fila "Detalle". `labels` traduce IDs de catálogos y empleados a su nombre.
 */
export function diffRows(before: unknown, after: unknown, labels: Map<string, string> = new Map()): DiffRow[] {
  const b = asObject(before);
  const a = asObject(after);
  if (!b && !a) {
    if ((before ?? null) === null && (after ?? null) === null) return [];
    return [
      {
        field: "",
        label: "Detalle",
        before: formatAuditValue(before as Json),
        after: formatAuditValue(after as Json),
        changed: true,
      },
    ];
  }
  const keys = [...new Set([...Object.keys(b ?? {}), ...Object.keys(a ?? {})])];
  return keys.map((field) => {
    const show = (value: Json | undefined) =>
      typeof value === "string" && labels.has(value) ? labels.get(value)! : formatAuditValue(value);
    const left = show(b?.[field]);
    const right = show(a?.[field]);
    return {
      field,
      label: FIELD_LABELS[field] ?? field,
      before: left,
      after: right,
      changed: !!b && !!a && left !== right,
    };
  });
}

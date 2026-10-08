import { employeeSchema } from "@/features/employees/schemas";
import { IMPORT_COLUMNS, normalizeKey, type ImportColumn, type LookupKey } from "./columns";

/*
 * De la grilla del archivo a los datos del alta, con los mismos esquemas del
 * formulario. Función pura: recibe los catálogos ya leídos.
 */

export type Lookups = {
  /** Nombre normalizado → id; null si dos valores activos se llaman igual. */
  options: Record<LookupKey, Map<string, string | null>>;
  /** Legajo → id de empleados activos (para el superior). */
  supervisors: Map<number, string>;
  contractTypesWithEndDate: Set<string>;
  /** Categoría → convenio al que pertenece (o null). */
  categoryAgreement: Map<string, string | null>;
};

/** CREADA: la fila se importó al confirmar (con su número de legajo). */
export type RowStatus = "VALIDA" | "ERROR" | "DUPLICADA" | "CREADA";

export type ImportRow = {
  rowNumber: number;
  name: string;
  dni: string;
  cuil: string;
  fileNumber: number | null;
  status: RowStatus;
  errors: string[];
  /** Datos listos para el alta (solo filas válidas; se borran al confirmar o descartar). */
  input?: Record<string, unknown>;
};

const HEADER_INDEX = new Map(IMPORT_COLUMNS.map((c) => [normalizeKey(c.header), c]));

/** Columnas del archivo → columnas conocidas. Faltantes obligatorias = error de estructura. */
export function matchHeaders(headers: string[]) {
  const positions = new Map<string, number>();
  const unknown: string[] = [];
  const repeated: string[] = [];
  headers.forEach((header, i) => {
    if (header.trim() === "") return;
    const column = HEADER_INDEX.get(normalizeKey(header));
    if (!column) unknown.push(header);
    else if (positions.has(column.field)) repeated.push(header);
    else positions.set(column.field, i);
  });
  const missing = IMPORT_COLUMNS.filter((c) => c.required && !positions.has(c.field)).map((c) => c.header);
  return { positions, unknown, repeated, missing };
}

const DATE_DMY = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;
const DATE_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Fecha de Excel guardada como número de serie (días desde el 30/12/1899). */
const EXCEL_SERIAL = /^\d{5}$/;
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/**
 * "dd/mm/aaaa" (o "aaaa-mm-dd", o el número de serie con que Excel guarda una
 * fecha en una celda de texto) → "aaaa-mm-dd", o null si no es una fecha real.
 */
export function toIsoDate(value: string): string | null {
  if (EXCEL_SERIAL.test(value)) return new Date(EXCEL_EPOCH + Number(value) * 86_400_000).toISOString().slice(0, 10);
  const dmy = DATE_DMY.exec(value);
  const iso = DATE_ISO.exec(value);
  const [y, m, d] = dmy ? [dmy[3], dmy[2], dmy[1]] : iso ? [iso[1], iso[2], iso[3]] : [];
  if (!y || !m || !d) return null;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (date.getUTCMonth() !== Number(m) - 1 || date.getUTCDate() !== Number(d)) return null;
  return date.toISOString().slice(0, 10);
}

function convert(column: ImportColumn, raw: string, lookups: Lookups): { value: unknown; error?: string } {
  if (raw === "") return { value: null };
  const kind = column.kind;
  if (kind === "text") return { value: raw };
  if (kind === "number") return { value: raw.replace(/\./g, "") };
  if (kind === "date") {
    const iso = toIsoDate(raw);
    return iso
      ? { value: iso }
      : { value: null, error: `${column.header}: "${raw}" no es una fecha (usá dd/mm/aaaa).` };
  }
  if (kind === "sex") {
    const letter = normalizeKey(raw).charAt(0).toUpperCase();
    return ["F", "M", "X"].includes(letter)
      ? { value: letter }
      : { value: null, error: `${column.header}: usá F, M o X.` };
  }
  if (kind === "supervisor") {
    const id = lookups.supervisors.get(Number(raw.replace(/\./g, "")));
    return id
      ? { value: id }
      : { value: null, error: `${column.header}: no hay un empleado activo con legajo ${raw}.` };
  }
  const id = lookups.options[kind.lookup].get(normalizeKey(raw));
  if (id === null) return { value: null, error: `${column.header}: hay más de un valor activo llamado "${raw}".` };
  return id ? { value: id } : { value: null, error: `${column.header}: "${raw}" no existe o está desactivado.` };
}

const LABELS = new Map(IMPORT_COLUMNS.map((c) => [c.field, c.header]));

/** Una fila del archivo → datos del alta y errores en palabras, con el nombre de la columna. */
/** Índice nombre → id, marcando los nombres repetidos como ambiguos. */
export function indexByName(options: { id: string; label: string }[]) {
  const index = new Map<string, string | null>();
  for (const option of options) {
    const key = normalizeKey(option.label);
    index.set(key, index.has(key) && index.get(key) !== option.id ? null : option.id);
  }
  return index;
}

export function mapRow(
  rowNumber: number,
  cells: string[],
  positions: Map<string, number>,
  lookups: Lookups,
): ImportRow {
  const errors: string[] = [];
  const input: Record<string, unknown> = {};
  const raw = (field: string) => {
    const i = positions.get(field);
    return i === undefined ? "" : (cells[i] ?? "").trim();
  };
  for (const column of IMPORT_COLUMNS) {
    const { value, error } = convert(column, raw(column.field), lookups);
    if (error) errors.push(error);
    input[column.field] = value;
  }
  const base = {
    rowNumber,
    name: [raw("lastName"), raw("firstName")].filter(Boolean).join(", ") || "(sin nombre)",
    dni: raw("dni").replace(/\D/g, ""),
    cuil: raw("cuil").replace(/\D/g, ""),
    fileNumber: /^\d+$/.test(raw("fileNumber").replace(/\./g, ""))
      ? Number(raw("fileNumber").replace(/\./g, ""))
      : null,
  };

  const parsed = employeeSchema.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "");
      // Si la conversión ya explicó el problema de esa columna, no se repite.
      if (input[field] === null && errors.some((e) => e.startsWith(`${LABELS.get(field)}:`))) continue;
      errors.push(`${LABELS.get(field) ?? field}: ${issue.message}`);
    }
  } else {
    const data = parsed.data;
    if (lookups.contractTypesWithEndDate.has(data.contractTypeId) && !data.contractEndDate) {
      errors.push("Fin de contrato: el tipo de contratación exige fecha de finalización.");
    }
    const agreement = data.categoryId ? lookups.categoryAgreement.get(data.categoryId) : null;
    if (agreement && agreement !== data.agreementId) {
      errors.push("Categoría: no corresponde al convenio indicado.");
    }
  }
  return errors.length > 0
    ? { ...base, status: "ERROR", errors }
    : { ...base, status: "VALIDA", errors: [], input: parsed.data as Record<string, unknown> };
}

/**
 * Marca como duplicadas las filas que repiten DNI, CUIL o legajo de otra fila
 * anterior del archivo o de un legajo existente. Nunca se modifica un legajo.
 */
export function markDuplicates(
  rows: ImportRow[],
  existing: { fileNumber: number; dni: string; cuil: string; lastName: string; firstName: string }[],
): ImportRow[] {
  const byDni = new Map(existing.map((e) => [e.dni, e]));
  const byCuil = new Map(existing.map((e) => [e.cuil, e]));
  const byFile = new Map(existing.map((e) => [e.fileNumber, e]));
  const seen = { dni: new Map<string, number>(), cuil: new Map<string, number>(), file: new Map<number, number>() };
  return rows.map((row) => {
    const reasons: string[] = [];
    const match =
      (row.dni && byDni.get(row.dni)) ||
      (row.cuil && byCuil.get(row.cuil)) ||
      (row.fileNumber && byFile.get(row.fileNumber));
    if (match)
      reasons.push(
        `Ya existe el legajo ${match.fileNumber} (${match.lastName}, ${match.firstName}) con el mismo DNI, CUIL o número de legajo.`,
      );
    const earlier =
      (row.dni && seen.dni.get(row.dni)) ||
      (row.cuil && seen.cuil.get(row.cuil)) ||
      (row.fileNumber && seen.file.get(row.fileNumber));
    if (earlier) reasons.push(`Repite el DNI, CUIL o legajo de la fila ${earlier}.`);
    if (row.dni && !seen.dni.has(row.dni)) seen.dni.set(row.dni, row.rowNumber);
    if (row.cuil && !seen.cuil.has(row.cuil)) seen.cuil.set(row.cuil, row.rowNumber);
    if (row.fileNumber && !seen.file.has(row.fileNumber)) seen.file.set(row.fileNumber, row.rowNumber);
    if (reasons.length === 0) return row;
    const { input: _input, ...rest } = row;
    void _input;
    return { ...rest, status: "DUPLICADA", errors: [...reasons, ...row.errors] };
  });
}

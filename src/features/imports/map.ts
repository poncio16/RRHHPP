import { employeeSchema } from "@/features/employees/schemas";
import {
  IMPORT_COLUMNS,
  isCreatable,
  newNameMax,
  normalizeKey,
  type CreatableLookup,
  type ImportColumn,
  type LookupKey,
} from "./columns";

/*
 * De la grilla del archivo a los datos del alta, con los mismos esquemas del
 * formulario. Función pura: recibe los catálogos ya leídos.
 */

export type Lookups = {
  /** Nombre normalizado → id; null si dos valores activos se llaman igual. */
  options: Record<LookupKey, Map<string, string | null>>;
  /** Nombres normalizados de los valores desactivados. */
  inactive: Partial<Record<LookupKey, Set<string>>>;
  /** Nombres de los sectores, puestos y establecimientos activos, para avisar de uno parecido. */
  labels: Partial<Record<CreatableLookup, string[]>>;
  /** Si los sectores, puestos y establecimientos que no existen se dan de alta (quien importa administra los catálogos). */
  createsCatalogs: boolean;
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
  /** Valores nuevos de Catálogos que usa la fila ("Sector nuevo: Logística"). */
  notes?: string[];
};

/** Un sector, puesto o establecimiento que no existe y se da de alta al confirmar. */
export type NewCatalogItem = {
  key: CreatableLookup;
  /** Id con el que se va a crear: las filas válidas ya lo usan. */
  id: string;
  /** Tal como está escrito en la primera fila que lo usa. */
  name: string;
  /** Un valor activo de nombre parecido: quizás es un error de tipeo. */
  similar?: string;
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
  const key = kind.lookup;
  const id = lookups.options[key].get(normalizeKey(raw));
  if (id === null) return { value: null, error: `${column.header}: hay más de un valor activo llamado "${raw}".` };
  if (id) return { value: id };
  if (key === "provincias") {
    return { value: null, error: `${column.header}: "${raw}" no es una provincia (escribí el nombre o el código).` };
  }
  // Los horarios se administran en su propia pantalla; el resto, en Catálogos.
  const where = key === "horarios" ? "Configuración → Horarios" : "Catálogos";
  if (lookups.inactive[key]?.has(normalizeKey(raw))) {
    return { value: null, error: `${column.header}: "${raw}" está desactivado en ${where}.` };
  }
  // Si se podía dar de alta y no está entre los nuevos, es porque el nombre es demasiado largo.
  if (lookups.createsCatalogs && isCreatable(key)) {
    return {
      value: null,
      error: `${column.header}: "${raw}" no existe y no se puede dar de alta: el nombre puede tener hasta ${newNameMax(key)} caracteres.`,
    };
  }
  return { value: null, error: `${column.header}: "${raw}" no existe en ${where}.` };
}

const LABELS = new Map(IMPORT_COLUMNS.map((c) => [c.field, c.header]));

/** Índice nombre → id, marcando los nombres repetidos como ambiguos. */
export function indexByName(options: { id: string; label: string }[]) {
  const index = new Map<string, string | null>();
  for (const option of options) {
    const key = normalizeKey(option.label);
    index.set(key, index.has(key) && index.get(key) !== option.id ? null : option.id);
  }
  return index;
}

/** Columnas de los catálogos que la importación puede completar. */
const CREATABLE_COLUMNS = IMPORT_COLUMNS.flatMap((column) =>
  typeof column.kind === "object" && isCreatable(column.kind.lookup) ? [{ ...column, key: column.kind.lookup }] : [],
);

/** Sin mayúsculas, acentos, espacios ni signos: "RR.HH." y "RRHH" son lo mismo. */
const bare = (value: string) => normalizeKey(value).replace(/[^a-z0-9]/g, "");

/** Cambios de una letra (agregar, quitar o cambiar) para pasar de un texto al otro. */
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length]!;
}

/** "Sucursal 1" y "Sucursal 2", o "Turno A" y "Turno B": nombres que difieren a propósito en un número o una letra suelta. */
function numbered(a: string, b: string): boolean {
  const left = normalizeKey(a).split(" ");
  const right = normalizeKey(b).split(" ");
  if (left.length !== right.length) return false;
  const changed = left.flatMap((word, i) => (word === right[i] ? [] : [[word, right[i]!]]));
  return changed.length === 1 && changed[0]!.every((word) => /^\d+$/.test(word) || word.length === 1);
}

/**
 * El nombre más parecido a uno nuevo, si difiere solo en espacios y signos, o
 * en una letra (dos en nombres de 8 o más; ninguna en los de menos de 4):
 * probable error de tipeo, como "Deposito" por "Depósitos". No cuenta los
 * que cambian solo en un número o una letra suelta, como "Sucursal 1" y "2".
 */
export function similarName(name: string, existing: readonly string[]): string | undefined {
  const target = bare(name);
  let best: { label: string; distance: number } | undefined;
  for (const label of existing) {
    if (numbered(name, label)) continue;
    const other = bare(label);
    const shorter = Math.min(target.length, other.length);
    const allowed = shorter >= 8 ? 2 : shorter >= 4 ? 1 : 0;
    const distance = editDistance(target, other);
    if (distance <= allowed && (!best || distance < best.distance)) best = { label, distance };
  }
  return best?.label;
}

/**
 * Sectores, puestos y establecimientos del archivo que no existen, ni activos
 * ni desactivados: uno por nombre (sin distinguir mayúsculas ni acentos), con
 * el texto de la primera fila que lo usa. `newId` da el id con que se van a
 * crear. Vacío si quien importa no administra los catálogos. El aviso de
 * nombres parecidos lo agrega `attachNewItems`.
 */
export function planNewItems(
  rows: readonly { cells: string[] }[],
  positions: Map<string, number>,
  lookups: Lookups,
  newId: () => string,
): NewCatalogItem[] {
  if (!lookups.createsCatalogs) return [];
  const planned = new Map<string, NewCatalogItem>();
  for (const column of CREATABLE_COLUMNS) {
    const index = positions.get(column.field);
    if (index === undefined) continue;
    for (const row of rows) {
      const name = (row.cells[index] ?? "").trim().replace(/\s+/g, " ");
      const key = normalizeKey(name);
      if (name === "" || name.length > newNameMax(column.key)) continue;
      if (lookups.options[column.key].has(key) || lookups.inactive[column.key]?.has(key)) continue;
      if (planned.has(`${column.key}:${key}`)) continue;
      planned.set(`${column.key}:${key}`, { key: column.key, id: newId(), name });
    }
  }
  return [...planned.values()];
}

/** Los catálogos con los valores nuevos, para que las filas que los usan los encuentren. */
export function withNewItems(lookups: Lookups, items: readonly NewCatalogItem[]): Lookups {
  const options = { ...lookups.options };
  for (const key of new Set(items.map((item) => item.key))) options[key] = new Map(options[key]);
  for (const item of items) options[item.key].set(normalizeKey(item.name), item.id);
  return { ...lookups, options };
}

/**
 * Anota en cada fila válida los valores nuevos que usa y devuelve solo los que
 * usa alguna (los de filas con errores o duplicadas no se crean), cada uno con
 * el nombre parecido que haya entre los existentes o los nuevos anteriores:
 * en una instalación nueva, "RRHH" y "RR.HH." en el mismo archivo.
 */
export function attachNewItems(rows: ImportRow[], planned: readonly NewCatalogItem[], labels: Lookups["labels"]) {
  const byId = new Map(planned.map((item) => [item.id, item]));
  const used = new Set<string>();
  const annotated = rows.map((row) => {
    if (row.status !== "VALIDA" || !row.input) return row;
    const notes = CREATABLE_COLUMNS.flatMap((column) => {
      const item = byId.get(String(row.input?.[column.field]));
      if (!item) return [];
      used.add(item.id);
      return [`${column.header} nuevo: ${item.name}`];
    });
    return notes.length > 0 ? { ...row, notes } : row;
  });
  const newItems = planned.filter((item) => used.has(item.id));
  return {
    rows: annotated,
    newItems: newItems.map((item, i) => {
      const earlier = newItems.slice(0, i).filter((other) => other.key === item.key);
      const similar = similarName(item.name, [...(labels[item.key] ?? []), ...earlier.map((other) => other.name)]);
      return similar ? { ...item, similar } : item;
    }),
  };
}

/** Una fila del archivo → datos del alta y errores en palabras, con el nombre de la columna. */
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

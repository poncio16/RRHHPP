import { normalizeKey } from "@/features/imports/columns";
import { parseDate, parseIsoDate, toIsoDate } from "@/lib/format";
import { fromCents, normalizeDecimal, toCents } from "@/lib/validators";
import { HEADER_SEARCH_ROWS } from "./constants";

/*
 * De las hojas leídas a movimientos: encabezado, empleado de cada fila, fecha
 * e importes. Sin acceso a datos, para probarlo con planillas armadas a mano.
 */

/** Celda leída: el texto y, si Excel la guardó así, el número o la fecha. */
export type Cell = { text: string; number?: number; date?: Date };
export type SheetRow = { rowNumber: number; cells: Cell[] };
export type Sheet = { name: string; rows: SheetRow[] };

export type Field = "fecha" | "concepto" | "ingreso" | "retiro" | "importe";

/** Encabezados aceptados para cada dato (sin mayúsculas, acentos ni signos). */
const HEADER_ALIASES: Record<Field, readonly string[]> = {
  fecha: ["fecha", "fecha movimiento", "fecha de movimiento", "fecha del movimiento", "dia"],
  concepto: ["concepto", "detalle", "descripcion", "observaciones", "observacion", "motivo"],
  ingreso: ["ingreso", "ingresos", "credito", "creditos", "entrada", "entradas", "deposito", "depositos"],
  retiro: ["retiro", "retiros", "debito", "debitos", "salida", "salidas", "egreso", "egresos"],
  importe: ["importe", "monto"],
};

/** Columnas que se reconocen pero no se leen: el saldo se calcula. */
const IGNORED_HEADERS = new Set(["saldo", "saldo acumulado"]);

const headerKey = (text: string) =>
  normalizeKey(text)
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const ALIAS_INDEX = new Map<string, Field>(
  Object.entries(HEADER_ALIASES).flatMap(([field, aliases]) => aliases.map((a) => [a, field as Field] as const)),
);

export type Columns = Partial<Record<Field, number>>;

/** Columnas reconocidas de una fila, o null si no parece un encabezado de movimientos. */
export function matchHeaderRow(cells: readonly Cell[]): Columns | null {
  const columns: Columns = {};
  cells.forEach((cell, index) => {
    const key = headerKey(cell.text);
    // "Descripción INGRESO 15-05-12": algunas hojas anotan algo al lado del título.
    const field = ALIAS_INDEX.get(key) ?? (/^(descripcion|concepto|detalle) /.test(key) ? "concepto" : undefined);
    if (field && columns[field] === undefined) columns[field] = index;
  });
  const hasAmount = columns.ingreso !== undefined || columns.retiro !== undefined || columns.importe !== undefined;
  return columns.fecha !== undefined && hasAmount ? columns : null;
}

export type Header = { index: number; columns: Columns; ignored: string[] };

/** Busca el encabezado en las primeras filas de la hoja (puede haber títulos arriba). */
export function findHeader(sheet: Sheet): Header | null {
  for (const [index, row] of sheet.rows.slice(0, HEADER_SEARCH_ROWS).entries()) {
    const columns = matchHeaderRow(row.cells);
    if (columns) {
      const used = new Set(Object.values(columns));
      const ignored = row.cells
        .map((c, i) => ({ text: c.text.trim(), i }))
        .filter(({ text, i }) => text !== "" && !used.has(i) && !IGNORED_HEADERS.has(headerKey(text)))
        .map(({ text }) => text);
      return { index, columns, ignored };
    }
  }
  return null;
}

/**
 * Hoja sin encabezado: si todas las demás hojas del archivo usan las mismas
 * columnas, se toman esas y los datos empiezan en la primera fila con fecha.
 */
export function inferHeader(sheet: Sheet, layouts: readonly Columns[]): Header | null {
  if (layouts.length === 0) return null;
  const signature = (c: Columns) => JSON.stringify(Object.entries(c).sort(([a], [b]) => a.localeCompare(b)));
  if (new Set(layouts.map(signature)).size !== 1) return null;
  const columns = layouts[0]!;
  const first = sheet.rows.findIndex((row) => parseCellDate(row.cells[columns.fecha!] ?? { text: "" }) !== null);
  // `index` es la fila anterior a los datos (el encabezado que no está).
  return first === -1 ? null : { index: first - 1, columns, ignored: [] };
}

/* ----------------------------------------------------------------------------
 * Valores
 * ------------------------------------------------------------------------- */

/** Número de serie de Excel (días desde el 30/12/1899) → fecha, para celdas de fecha sin formato. */
function excelSerialDate(serial: number): Date | null {
  if (!Number.isInteger(serial) || serial < 20_000 || serial > 80_000) return null;
  return new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
}

/** "5/3/25" → año 2025. */
function parseShortYear(text: string): Date | null {
  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$/.exec(text);
  if (!match) return null;
  return parseDate(`${match[1]}/${match[2]}/20${match[3]}`);
}

export function parseCellDate(cell: Cell): Date | null {
  if (cell.date) return parseIsoDate(toIsoDate(cell.date));
  if (cell.number !== undefined) return excelSerialDate(cell.number);
  const text = cell.text.trim();
  return parseDate(text.replace(/-/g, "/")) ?? parseIsoDate(text) ?? parseShortYear(text);
}

/**
 * Importe de una celda en centavos (con signo), null si está vacía o
 * "invalid". Acepta "1.234,56", "-1234.5", "(1.234,56)" y "$ 1.234".
 */
export function parseCellAmount(cell: Cell): bigint | null | "invalid" {
  if (cell.number !== undefined) {
    if (!Number.isFinite(cell.number) || Math.abs(cell.number) >= 1e12) return "invalid";
    return BigInt(Math.round(cell.number * 100));
  }
  let text = cell.text.replace(/\s/g, "");
  if (text === "" || text === "-") return null;
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (text.startsWith("-")) {
    negative = !negative;
    text = text.slice(1);
  } else if (text.startsWith("$-")) {
    negative = !negative;
    text = `$${text.slice(2)}`;
  }
  const value = normalizeDecimal(text);
  if (value === null) return "invalid";
  const cents = toCents(value);
  return negative ? -cents : cents;
}

/* ----------------------------------------------------------------------------
 * Filas
 * ------------------------------------------------------------------------- */

/**
 * Ordena los saldos de la planilla de una hoja y separa los movimientos con
 * fecha anterior al último saldo, que suelen tener el año mal escrito.
 *
 * Si la fecha de un saldo es posterior a la del movimiento que lo sigue, la
 * que está mal es la del saldo: se usa la del concepto si no pasa de ese
 * movimiento. Si no, el saldo dejaría afuera todo el año.
 */
export function checkBalanceDates(entries: ParsedEntry[]) {
  const kept: ParsedEntry[] = [];
  const early: { entry: ParsedEntry; balanceDate: string }[] = [];
  let balanceDate: string | null = null;
  entries.forEach((entry, i) => {
    if (entry.opening) {
      const next = entries.slice(i + 1).find((e) => !e.opening);
      const date =
        next && entry.date > next.date && entry.statedDate && entry.statedDate <= next.date
          ? entry.statedDate
          : entry.date;
      balanceDate = date;
      kept.push({ ...entry, date });
    } else if (balanceDate && entry.date < balanceDate) early.push({ entry, balanceDate });
    else kept.push(entry);
  });
  return { kept, early };
}

/** Fecha escrita en el concepto, como en "Saldo al 30-12-16". */
function conceptDate(concept: string, today: Date): Date | null {
  const match = /\bal\s+(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})\b/i.exec(concept);
  if (!match) return null;
  const date = parseCellDate({ text: match[1]!.replace(/\./g, "/") });
  return date && date <= today ? date : null;
}

export type ParsedEntry = {
  sheet: string;
  rowNumber: number;
  /** AAAA-MM-DD */
  date: string;
  concept: string | null;
  /** Importes como "1234.50", mayores o iguales a 0. */
  credit: string;
  debit: string;
  /** Saldo que arrastra la planilla de años anteriores ("Saldo al 31/12/2018"). */
  opening: boolean;
  /** En un saldo de la planilla, la fecha escrita en el concepto ("Saldo al 30-12-16"). */
  statedDate?: string;
};

export type RowProblem = { sheet: string; rowNumber: number; message: string };

export type RowResult = { kind: "entry"; entry: ParsedEntry } | { kind: "error"; error: RowProblem } | { kind: "skip" };

const cellAt = (row: SheetRow, index: number | undefined): Cell =>
  index === undefined ? { text: "" } : (row.cells[index] ?? { text: "" });

/**
 * Saldo de años anteriores con el que empieza una planilla ("Saldo al
 * 31/12/2018", "Saldo anterior"): resume movimientos que pueden estar ya
 * cargados desde la planilla del año anterior.
 */
const OPENING_ROW = /^saldo (al|anterior|inicial)\b/;

/** Filas de totales o de saldo (sin fecha) que traen muchas planillas. */
const SUMMARY_ROW = /\b(total|totales|subtotal|saldo|transporte|suma)\b/;

/**
 * Una fila de datos. Se omiten las vacías, las de totales y las que no tienen
 * importes (por ejemplo, una nota sobre un aumento). Una fila con importe y
 * sin fecha toma la de la fila anterior (`previousDate`, AAAA-MM-DD).
 */
export function mapRow(
  sheet: string,
  row: SheetRow,
  columns: Columns,
  today: Date,
  previousDate: string | null,
): RowResult {
  const error = (message: string): RowResult => ({
    kind: "error",
    error: { sheet, rowNumber: row.rowNumber, message },
  });
  const dateCell = cellAt(row, columns.fecha);
  const amounts = {
    ingreso: columns.ingreso === undefined ? null : parseCellAmount(cellAt(row, columns.ingreso)),
    retiro: columns.retiro === undefined ? null : parseCellAmount(cellAt(row, columns.retiro)),
    importe: columns.importe === undefined ? null : parseCellAmount(cellAt(row, columns.importe)),
  };
  const anyAmount = Object.values(amounts).some((a) => a !== null && a !== 0n);
  const rowText = normalizeKey(row.cells.map((c) => c.text).join(" "));

  if (!anyAmount) return { kind: "skip" };
  let date: Date | null;
  if (dateCell.text.trim() === "" && dateCell.date === undefined && dateCell.number === undefined) {
    if (SUMMARY_ROW.test(rowText)) return { kind: "skip" };
    if (!previousDate) return error("Falta la fecha.");
    date = parseIsoDate(previousDate);
  } else {
    date = parseCellDate(dateCell);
  }
  if (!date) return error(`La fecha "${dateCell.text}" no es válida. Usá el formato dd/mm/aaaa.`);
  if (date.getUTCFullYear() < 2000) return error("La fecha es anterior al año 2000.");
  if (date > today) return error("La fecha es posterior a hoy.");

  for (const [field, value] of Object.entries(amounts)) {
    if (value === "invalid") {
      return error(
        `El importe de la columna "${field === "importe" ? "Importe" : field === "ingreso" ? "Ingreso" : "Retiro"}" no es válido.`,
      );
    }
  }
  // El saldo de las planillas es la suma de las dos columnas: los retiros van con signo menos y
  // un valor positivo en Retiro (una liquidación final) suma; uno negativo en Ingreso (una
  // corrección, "horas extras negativas") resta. Lo que suma es ingreso y lo que resta, retiro.
  let credit = 0n;
  let debit = 0n;
  for (const value of Object.values(amounts) as (bigint | null)[]) {
    if (value === null) continue;
    if (value > 0n) credit += value;
    else debit -= value;
  }

  const concept = cellAt(row, columns.concepto).text.trim().slice(0, 200);
  const opening = OPENING_ROW.test(normalizeKey(concept));
  return {
    kind: "entry",
    entry: {
      sheet,
      rowNumber: row.rowNumber,
      date: toIsoDate(date),
      concept: concept === "" ? null : concept,
      opening,
      ...(opening && { statedDate: toIsoDate(conceptDate(concept, today) ?? date) }),
      credit: fromCents(credit),
      debit: fromCents(debit),
    },
  };
}

/* ----------------------------------------------------------------------------
 * Cuentas
 * ------------------------------------------------------------------------- */

/** Clave de un nombre de hoja o de cuenta: sin mayúsculas, acentos ni espacios repetidos. */
export const sheetKey = (name: string) => normalizeKey(name);

/** Letras y espacios, sin el número final ("Fabi2" → "fabi"). */
const nameStem = (name: string) =>
  headerKey(name)
    .replace(/\s*\d+$/, "")
    .trim();

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length]!;
}

/**
 * ¿Dos nombres de hoja pueden ser la misma persona? "Luci" y "Luciano",
 * "Fabi" y "Fabi2", "Johny" y "Jony", "Pablo" y "Pablo G".
 */
export function similarNames(a: string, b: string): boolean {
  const x = nameStem(a);
  const y = nameStem(b);
  if (x === "" || y === "") return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length >= 3 && (long.startsWith(`${short} `) || long.startsWith(short))) return true;
  return short.length >= 4 && editDistance(x, y) <= 1;
}

/** Cuentas existentes con un nombre parecido, para preguntar antes de crear una nueva. */
export function similarAccounts<T extends { name: string }>(name: string, accounts: readonly T[]): T[] {
  return accounts.filter((account) => similarNames(name, account.name));
}

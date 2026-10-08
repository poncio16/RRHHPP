import "server-only";
import ExcelJS from "exceljs";
import { ValidationError } from "@/server/errors/app-error";
import { IMPORT_MAX_COLUMNS, IMPORT_MAX_UNZIPPED_BYTES } from "./columns";
import { checkZipSize } from "./zip";

/*
 * Lectura del archivo subido (Excel .xlsx o CSV) a una grilla de textos.
 * Las fechas de Excel se pasan a dd/mm/aaaa.
 */

type Line = { rowNumber: number; cells: string[] };
export type Sheet = { headers: string[]; rows: Line[] };

const UNREADABLE = "No se pudo leer el archivo. Guardalo como Excel (.xlsx) o CSV y volvé a subirlo.";
const tooWide = () =>
  new ValidationError(
    `El archivo tiene datos en más de ${IMPORT_MAX_COLUMNS} columnas. Usá la plantilla o borrá las columnas que sobran.`,
  );

const pad = (n: number) => String(n).padStart(2, "0");
const dateText = (d: Date) => `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return dateText(value);
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(value);
  if (typeof value === "string" || typeof value === "boolean") return String(value);
  if ("richText" in value) return value.richText.map((r) => r.text).join("");
  if ("text" in value) return String(value.text);
  if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
  return "";
}

async function readXlsx(bytes: Uint8Array): Promise<Line[]> {
  const zip = checkZipSize(bytes, IMPORT_MAX_UNZIPPED_BYTES);
  if (zip === "too-large") {
    throw new ValidationError(
      "El Excel es demasiado grande para importarlo. Pegá solo la lista de empleados en la plantilla y subila.",
    );
  }
  if (zip === "invalid") throw new ValidationError(UNREADABLE);

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes as never);
  } catch {
    throw new ValidationError(UNREADABLE);
  }
  // La primera hoja con datos (la plantilla trae también una hoja de instrucciones).
  const sheet = workbook.worksheets.find((s) => s.name.toLowerCase() === "empleados") ?? workbook.worksheets[0];
  if (!sheet) return [];
  // Solo filas y celdas con contenido: recorrer las vacías puede crear millones de objetos.
  const lines: Line[] = [];
  let wide = false;
  sheet.eachRow((row, rowNumber) => {
    const cells: string[] = [];
    row.eachCell((cell, col) => {
      const text = cellText(cell.value).trim();
      if (col <= IMPORT_MAX_COLUMNS) cells[col - 1] = text;
      else if (text !== "") wide = true;
    });
    lines.push({ rowNumber, cells: Array.from(cells, (c) => c ?? "") });
  });
  if (wide) throw tooWide();
  return lines;
}

function decode(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // Excel en Windows guarda los CSV en Windows-1252.
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** CSV con separador ";" "," o tabulación (se toma el más frecuente en el encabezado) y comillas dobles. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [";", ",", "\t"].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0]!;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i]!;
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === delimiter) {
      row.push(field.trim());
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i++;
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field.trim());
    rows.push(row);
  }
  return rows;
}

export async function readSpreadsheet(fileName: string, bytes: Uint8Array): Promise<Sheet> {
  const lower = fileName.toLowerCase();
  let lines: Line[];
  if (lower.endsWith(".xlsx")) lines = await readXlsx(bytes);
  else if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    lines = parseCsv(decode(bytes)).map((cells, i) => {
      if (cells.slice(IMPORT_MAX_COLUMNS).some((c) => c !== "")) throw tooWide();
      return { rowNumber: i + 1, cells: cells.slice(0, IMPORT_MAX_COLUMNS) };
    });
  } else throw new ValidationError("El archivo tiene que ser Excel (.xlsx) o CSV.");

  const [header, ...rows] = lines.filter((line) => line.cells.some((c) => c !== ""));
  if (!header) throw new ValidationError("El archivo está vacío.");
  return { headers: header.cells, rows };
}

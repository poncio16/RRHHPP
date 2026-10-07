import "server-only";
import ExcelJS from "exceljs";
import { ValidationError } from "@/server/errors/app-error";

/*
 * Lectura del archivo subido (Excel .xlsx o CSV) a una grilla de textos.
 * Las fechas de Excel se pasan a dd/mm/aaaa.
 */

export type Sheet = { headers: string[]; rows: { rowNumber: number; cells: string[] }[] };

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

async function readXlsx(bytes: Uint8Array): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes as never);
  } catch {
    throw new ValidationError("No se pudo leer el archivo. Guardalo como Excel (.xlsx) o CSV y volvé a subirlo.");
  }
  // La primera hoja con datos (la plantilla trae también una hoja de instrucciones).
  const sheet = workbook.worksheets.find((s) => s.name.toLowerCase() === "empleados") ?? workbook.worksheets[0];
  if (!sheet) return [];
  const grid: string[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cells[col - 1] = cellText(cell.value).trim();
    });
    grid[rowNumber - 1] = Array.from(cells, (c) => c ?? "");
  });
  return Array.from(grid, (r) => r ?? []);
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
  let grid: string[][];
  if (lower.endsWith(".xlsx")) grid = await readXlsx(bytes);
  else if (lower.endsWith(".csv") || lower.endsWith(".txt")) grid = parseCsv(decode(bytes));
  else throw new ValidationError("El archivo tiene que ser Excel (.xlsx) o CSV.");

  const headerIndex = grid.findIndex((r) => r.some((c) => c !== ""));
  if (headerIndex === -1) throw new ValidationError("El archivo está vacío.");
  const headers = grid[headerIndex]!;
  const rows = grid
    .slice(headerIndex + 1)
    .map((cells, i) => ({ rowNumber: headerIndex + i + 2, cells }))
    .filter((r) => r.cells.some((c) => c !== ""));
  return { headers, rows };
}

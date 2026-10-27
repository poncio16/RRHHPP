import "server-only";
import ExcelJS from "exceljs";
import { parseCsv } from "@/features/imports/parse";
import { checkZipSize } from "@/features/imports/zip";
import { ValidationError } from "@/server/errors/app-error";
import { WITHDRAWALS_MAX_ROWS, WITHDRAWALS_MAX_UNZIPPED_BYTES } from "./constants";
import type { Cell, Sheet, SheetRow } from "./map";

/*
 * Lectura de una planilla de retiros: todas las hojas de un Excel (cada una
 * puede ser un mes o un empleado) o un CSV. Se guarda el texto de cada celda
 * y, si Excel la tiene como número o fecha, ese valor.
 */

const UNREADABLE = "No se pudo leer el archivo. Guardalo como Excel (.xlsx) o CSV y volvé a subirlo.";
const MAX_COLUMNS = 50;

function toCell(value: ExcelJS.CellValue): Cell {
  if (value === null || value === undefined) return { text: "" };
  if (value instanceof Date) return { text: value.toISOString().slice(0, 10), date: value };
  if (typeof value === "number") return { text: String(value), number: value };
  if (typeof value === "string" || typeof value === "boolean") return { text: String(value).trim() };
  if ("richText" in value)
    return {
      text: value.richText
        .map((r) => r.text)
        .join("")
        .trim(),
    };
  if ("result" in value) return toCell(value.result as ExcelJS.CellValue);
  if ("text" in value) return { text: String(value.text).trim() };
  return { text: "" };
}

const tooManyRows = () =>
  new ValidationError(`El archivo tiene más de ${WITHDRAWALS_MAX_ROWS} filas con datos: dividilo en varios archivos.`);

async function readXlsx(bytes: Uint8Array): Promise<Sheet[]> {
  const zip = checkZipSize(bytes, WITHDRAWALS_MAX_UNZIPPED_BYTES);
  if (zip === "too-large") throw new ValidationError("El Excel es demasiado grande: dividilo en varios archivos.");
  if (zip === "invalid") throw new ValidationError(UNREADABLE);
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes as never);
  } catch {
    throw new ValidationError(UNREADABLE);
  }
  let total = 0;
  return workbook.worksheets
    .filter((sheet) => sheet.state === "visible")
    .map((sheet) => {
      const rows: SheetRow[] = [];
      // Solo filas y celdas con contenido: recorrer las vacías puede crear millones de objetos.
      sheet.eachRow((row, rowNumber) => {
        const cells: Cell[] = [];
        row.eachCell((cell, col) => {
          if (col <= MAX_COLUMNS) cells[col - 1] = toCell(cell.value);
        });
        const filled = Array.from(cells, (c) => c ?? { text: "" });
        if (filled.some((c) => c.text !== "")) {
          if (++total > WITHDRAWALS_MAX_ROWS) throw tooManyRows();
          rows.push({ rowNumber, cells: filled });
        }
      });
      return { name: sheet.name, rows };
    });
}

function decode(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // Excel en Windows guarda los CSV en Windows-1252.
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** Firma de los archivos de Office "viejos": un .xls o un .xlsx cifrado con contraseña. */
const isOleFile = (bytes: Uint8Array) =>
  bytes.length > 8 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;

export async function readWorkbook(fileName: string, bytes: Uint8Array): Promise<Sheet[]> {
  const lower = fileName.toLowerCase();
  if (isOleFile(bytes)) {
    throw new ValidationError(
      lower.endsWith(".xlsx")
        ? "El archivo tiene contraseña. Abrilo en Excel, quitale la contraseña (Archivo › Información › Proteger libro) y guardalo."
        : "Los Excel viejos (.xls) no se pueden leer: abrilo y guardalo como .xlsx.",
    );
  }
  if (lower.endsWith(".xlsx")) return readXlsx(bytes);
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    const rows = parseCsv(decode(bytes))
      .map((cells, i) => ({ rowNumber: i + 1, cells: cells.slice(0, MAX_COLUMNS).map((text) => ({ text })) }))
      .filter((row) => row.cells.some((c) => c.text !== ""));
    if (rows.length > WITHDRAWALS_MAX_ROWS) throw tooManyRows();
    return [{ name: fileName.replace(/\.[^.]+$/, ""), rows }];
  }
  if (lower.endsWith(".xls")) {
    throw new ValidationError("Los Excel viejos (.xls) no se pueden leer: abrilo y guardalo como .xlsx.");
  }
  throw new ValidationError("El archivo tiene que ser Excel (.xlsx) o CSV.");
}

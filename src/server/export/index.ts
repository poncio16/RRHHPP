import "server-only";
import ExcelJS from "exceljs";
import type { Cell, Column, ReportResult, ReportTable } from "@/features/reports/table";
import { formatDate } from "@/lib/format";

/*
 * Archivos de exportación a partir de las tablas de los reportes y listados.
 * CSV pensado para Excel en español: separador ";", coma decimal, fechas
 * dd/mm/aaaa y BOM UTF-8. Excel (.xlsx) con una hoja por tabla y tipos reales.
 */

/** Un texto que empieza con = + - @ se tomaría como fórmula al abrir el archivo. */
function safeText(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

const csvNumber = (value: number, decimals: number) => value.toFixed(decimals).replace(".", ",");

function csvCell(value: Cell | undefined, type: Column["type"]): string {
  if (value === null || value === undefined) return "";
  let text: string;
  if (value instanceof Date) text = formatDate(value);
  else if (typeof value === "number") {
    text =
      type === "percent"
        ? csvNumber(value * 100, 1)
        : type === "money" || type === "decimal"
          ? csvNumber(value, 2)
          : type === "number"
            ? String(value).replace(".", ",")
            : String(value);
  } else text = safeText(value);
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const csvLabel = (c: Column) => (c.type === "percent" && c.label !== "%" ? `${c.label} (%)` : c.label);

export function tableToCsv(table: ReportTable): string {
  const lines = [table.columns.map((c) => csvCell(csvLabel(c), "text")).join(";")];
  for (const row of table.rows) lines.push(table.columns.map((c) => csvCell(row[c.key], c.type)).join(";"));
  if (table.totals) lines.push(table.columns.map((c) => csvCell(table.totals![c.key], c.type)).join(";"));
  return `﻿${lines.join("\r\n")}\r\n`;
}

const NUMBER_FORMATS: Partial<Record<NonNullable<Column["type"]>, string>> = {
  int: "#,##0",
  decimal: "#,##0.00",
  money: '"$" #,##0.00',
  percent: "0.0%",
  date: "dd/mm/yyyy",
};

function sheetName(title: string, used: Set<string>): string {
  const base = title.replace(/[[\]:*?/\\]/g, " ").slice(0, 28) || "Hoja";
  let name = base;
  for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base.slice(0, 26)} ${i}`;
  used.add(name.toLowerCase());
  return name;
}

const shownNumber = (decimals: number) =>
  new Intl.NumberFormat("es-AR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
const SHOWN = { int: shownNumber(0), decimal: shownNumber(2) };

/** Largo del texto que muestra Excel con el formato de la columna, para que el ancho alcance (y no salga ###). */
function shownLength(value: Cell | undefined, type: Column["type"]): number {
  if (value === null || value === undefined) return 0;
  if (value instanceof Date) return 10;
  if (typeof value === "string") return value.length;
  switch (type) {
    case "int":
      return SHOWN.int.format(value).length;
    case "decimal":
      return SHOWN.decimal.format(value).length;
    case "money":
      return SHOWN.decimal.format(value).length + 2;
    case "percent":
      return (value * 100).toFixed(1).length + 1;
    default:
      return String(value).length;
  }
}

/* Planilla para enviar (`ReportTable.sheet`): Arial 8 con bordes finos y encabezado celeste, centrado y en varias líneas. */

const SHEET_FONT = { name: "Arial", size: 8 };
const THIN = { style: "thin" } as const;
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };

function styleSheet(header: ExcelJS.Row, body: ExcelJS.Row[], columns: Column[]) {
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF95B3D7" } };
    cell.border = BORDER;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  for (const row of body) {
    row.font = SHEET_FONT;
    columns.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      cell.border = BORDER;
      // Textos a la izquierda; códigos, fechas y números centrados o a la derecha como en una planilla a mano.
      if (c.type === "number" || c.type === "date") cell.alignment = { horizontal: "center" };
    });
  }
}

/** Líneas que ocupa un texto partido por palabras en una columna de `width` caracteres. */
function wrappedLines(text: string, width: number): number {
  let lines = 1;
  let used = 0;
  for (const word of text.split(/\s+/)) {
    if (used > 0 && used + 1 + word.length > width) {
      lines += 1;
      used = word.length;
    } else used += (used > 0 ? 1 : 0) + word.length;
  }
  return lines;
}

/** Alto del encabezado para que entre la etiqueta con más líneas (Arial 8: unos 11 puntos por línea). */
function headerHeight(labels: [string, number][]): number {
  const lines = Math.max(1, ...labels.map(([label, width]) => wrappedLines(label, Math.max(width - 1, 1))));
  return Math.max(15, lines * 11 + 4);
}

export async function reportToXlsx(result: ReportResult, tables: ReportTable[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "RRHHPP";
  workbook.created = new Date();
  const used = new Set<string>();

  for (const table of tables) {
    const sheet = workbook.addWorksheet(sheetName(table.title, used));
    const styled = table.sheet !== undefined;
    sheet.addRow([safeText(table.sheet?.heading ?? `${result.title} — ${table.title}`)]).font = styled
      ? { name: SHEET_FONT.name, bold: true, underline: true, size: 11 }
      : { bold: true, size: 13 };
    for (const line of [...(result.notice ? [result.notice] : []), ...result.filters]) {
      const row = sheet.addRow([safeText(line)]);
      if (styled) row.font = SHEET_FONT;
    }
    sheet.addRow([]);

    const header = sheet.addRow(table.columns.map((c) => c.label));
    header.font = styled ? { ...SHEET_FONT, bold: true } : { bold: true };
    const headerRow = header.number;
    const cellValue = (value: Cell | undefined) =>
      value === null || value === undefined ? null : typeof value === "string" ? safeText(value) : value;
    const body = table.rows.map((row) => sheet.addRow(table.columns.map((c) => cellValue(row[c.key]))));
    if (table.totals) sheet.addRow(table.columns.map((c) => cellValue(table.totals![c.key]))).font = { bold: true };
    if (table.rows.length === 0) sheet.addRow([table.empty]);
    if (styled) styleSheet(header, body, table.columns);

    table.columns.forEach((c, i) => {
      const column = sheet.getColumn(i + 1);
      const format = c.type ? NUMBER_FORMATS[c.type] : undefined;
      if (format) column.numFmt = format;
      // En la planilla el encabezado va en varias líneas: alcanza con que entre su palabra más larga.
      const label = styled ? Math.max(...c.label.split(/\s+/).map((word) => word.length)) : c.label.length;
      const longest = Math.max(label, ...table.rows.slice(0, 500).map((r) => shownLength(r[c.key], c.type)));
      column.width = Math.min(Math.max(longest + 2, 8), styled ? 40 : 50);
    });
    if (styled) {
      header.height = headerHeight(table.columns.map((c, i) => [c.label, sheet.getColumn(i + 1).width ?? 10]));
      // Impresa entra a lo ancho de una hoja apaisada.
      sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    }
    sheet.views = [
      { state: "frozen", ySplit: headerRow, ...(styled ? { xSplit: Math.min(2, table.columns.length) } : {}) },
    ];
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

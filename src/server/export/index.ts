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

export async function reportToXlsx(result: ReportResult, tables: ReportTable[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "RRHHPP";
  workbook.created = new Date();
  const used = new Set<string>();

  for (const table of tables) {
    const sheet = workbook.addWorksheet(sheetName(table.title, used));
    sheet.addRow([`${result.title} — ${table.title}`]).font = { bold: true, size: 13 };
    for (const line of [...(result.notice ? [result.notice] : []), ...result.filters]) sheet.addRow([safeText(line)]);
    sheet.addRow([]);

    const header = sheet.addRow(table.columns.map((c) => c.label));
    header.font = { bold: true };
    const headerRow = header.number;
    const cellValue = (value: Cell | undefined) =>
      value === null || value === undefined ? null : typeof value === "string" ? safeText(value) : value;
    for (const row of table.rows) sheet.addRow(table.columns.map((c) => cellValue(row[c.key])));
    if (table.totals) sheet.addRow(table.columns.map((c) => cellValue(table.totals![c.key]))).font = { bold: true };
    if (table.rows.length === 0) sheet.addRow([table.empty]);

    table.columns.forEach((c, i) => {
      const column = sheet.getColumn(i + 1);
      const format = c.type ? NUMBER_FORMATS[c.type] : undefined;
      if (format) column.numFmt = format;
      const longest = Math.max(
        c.label.length,
        ...table.rows.slice(0, 500).map((r) => {
          const v = r[c.key];
          return v instanceof Date ? 10 : v === null || v === undefined ? 0 : String(v).length;
        }),
      );
      column.width = Math.min(Math.max(longest + 2, 8), 50);
    });
    sheet.views = [{ state: "frozen", ySplit: headerRow }];
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

import "server-only";
import ExcelJS from "exceljs";
import { IMPORT_COLUMNS, IMPORT_MAX_ROWS, type LookupKey } from "./columns";

/**
 * Plantilla Excel: hoja "Empleados" con los encabezados (obligatorios en
 * negrita), "Instrucciones" con el formato de cada columna y "Valores" con los
 * nombres activos de cada catálogo, tal como hay que escribirlos.
 */
export async function buildTemplate(values: Record<LookupKey, string[]>): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "RRHHPP";
  workbook.created = new Date();

  const data = workbook.addWorksheet("Empleados");
  const header = data.addRow(IMPORT_COLUMNS.map((c) => c.header));
  IMPORT_COLUMNS.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.font = { bold: c.required };
    cell.fill = c.required
      ? { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } }
      : { type: "pattern", pattern: "none" };
    const column = data.getColumn(i + 1);
    column.width = Math.max(c.header.length + 2, 12);
    // Texto: así Excel no convierte DNI, CUIL ni fechas.
    column.numFmt = "@";
  });
  data.views = [{ state: "frozen", ySplit: 1 }];

  const help = workbook.addWorksheet("Instrucciones");
  help.addRow(["Importación de empleados"]).font = { bold: true, size: 13 };
  for (const line of [
    "Completá una fila por empleado en la hoja Empleados, sin cambiar los encabezados. Las columnas resaltadas son obligatorias.",
    `Hasta ${IMPORT_MAX_ROWS} filas por archivo. También se acepta CSV con los mismos encabezados.`,
    "La importación solo da de alta legajos nuevos: si el DNI, el CUIL o el legajo ya existen, la fila se informa como duplicada y no se modifica nada.",
    "Antes de confirmar vas a ver una vista previa con los errores de cada fila.",
  ]) {
    help.addRow([line]);
  }
  help.addRow([]);
  help.addRow(["Columna", "Obligatoria", "Formato"]).font = { bold: true };
  for (const c of IMPORT_COLUMNS) help.addRow([c.header, c.required ? "Sí" : "No", c.help]);
  help.getColumn(1).width = 30;
  help.getColumn(2).width = 12;
  help.getColumn(3).width = 70;

  const lists = workbook.addWorksheet("Valores");
  const lookups = IMPORT_COLUMNS.flatMap((c) =>
    typeof c.kind === "object" ? [{ header: c.header, key: c.kind.lookup }] : [],
  );
  lists.addRow(lookups.map((l) => l.header)).font = { bold: true };
  const longest = Math.max(0, ...lookups.map((l) => values[l.key].length));
  for (let i = 0; i < longest; i++) lists.addRow(lookups.map((l) => values[l.key][i] ?? null));
  lookups.forEach((l, i) => {
    lists.getColumn(i + 1).width = Math.min(Math.max(l.header.length, ...values[l.key].map((v) => v.length)) + 2, 40);
  });
  lists.views = [{ state: "frozen", ySplit: 1 }];

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/*
 * Modelo de tabla compartido por las pantallas de reportes y las
 * exportaciones: el servicio arma las filas una vez y la pantalla, el CSV y el
 * Excel solo cambian el formato.
 */

export type ColumnType = "text" | "int" | "decimal" | "money" | "percent" | "date";

export type Column = { key: string; label: string; type?: ColumnType };

export type Cell = string | number | Date | null;

export type ReportRow = Record<string, Cell> & { /** Enlace opcional al legajo. */ _href?: string | null };

export type ReportTable = {
  id: string;
  title: string;
  columns: Column[];
  rows: ReportRow[];
  /** Fila de totales (mismas claves que las columnas). */
  totals?: Record<string, Cell>;
  /** Texto cuando no hay filas. */
  empty: string;
};

export type ReportResult = {
  title: string;
  /** Descripción de los filtros aplicados, para la pantalla y el archivo. */
  filters: string[];
  /** Aviso fijo del reporte (p. ej. remuneraciones informadas). */
  notice?: string;
  tables: ReportTable[];
};

/** Tope de filas de una exportación de listado, para no armar archivos sin límite. */
export const EXPORT_MAX_ROWS = 10_000;

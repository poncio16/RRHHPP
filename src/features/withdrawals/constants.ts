/** Valores fijos de la cuenta corriente de retiros, compartidos entre cliente y servidor. */

export const ENTRY_SOURCE_LABELS = {
  MANUAL: "Carga manual",
  IMPORTACION: "Planilla",
} as const;

/** Planillas que se suben juntas. */
export const WITHDRAWALS_MAX_FILES = 20;
/** Por archivo: cada uno se sube en un pedido aparte y en Vercel ninguno puede pasar de 4,5 MB. */
export const WITHDRAWALS_MAX_BYTES = 4 * 1024 * 1024;
/** Un .xlsx descomprimido no puede pasar de esto (ExcelJS lo descomprime entero en memoria). */
export const WITHDRAWALS_MAX_UNZIPPED_BYTES = 25 * 1024 * 1024;
/** Filas con datos por archivo, sumando todas sus hojas (la planilla de un año tiene unas 15.000). */
export const WITHDRAWALS_MAX_ROWS = 60_000;
/** Filas del principio de cada hoja donde se busca el encabezado (puede haber títulos arriba). */
export const HEADER_SEARCH_ROWS = 15;
/** Errores que se muestran por archivo; el resto se cuenta. */
export const MAX_REPORTED_ERRORS = 50;
/** Movimientos por página en la cuenta corriente (la de una persona puede tener miles). */
export const STATEMENT_PAGE_SIZE = 100;

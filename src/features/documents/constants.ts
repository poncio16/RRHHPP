import type { ExpiryState } from "./expiry";

export const DOCUMENT_STATUS_LABELS = {
  PENDIENTE: "Pendiente",
  PRESENTADO: "Presentado",
  OBSERVADO: "Observado",
  ANULADO: "Anulado",
} as const;

export type DocumentStatus = keyof typeof DOCUMENT_STATUS_LABELS;

/** Estados que se eligen al cargar o editar; "Anulado" tiene su propia acción. */
export const EDITABLE_STATUSES = ["PRESENTADO", "PENDIENTE", "OBSERVADO"] as const;

export const EXPIRY_LABELS: Record<ExpiryState, string> = {
  SIN_VENCIMIENTO: "Sin vencimiento",
  VIGENTE: "Vigente",
  POR_VENCER: "Por vencer",
  VENCIDO: "Vencido",
};

/** Si el tipo es obligatorio en todo legajo activo, y con qué frecuencia. */
export const DOCUMENT_REQUIREMENT_LABELS = {
  UNA_VEZ: "Sí, una vez",
  MENSUAL: "Sí, todos los meses",
} as const;

export type DocumentRequirement = keyof typeof DOCUMENT_REQUIREMENT_LABELS;

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

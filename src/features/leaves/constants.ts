/** Valores fijos de licencias y vacaciones, compartidos entre cliente y servidor. */
import type { LEAVE_CLASS_FILTERS, LEAVE_STATUS_FILTERS, LEAVE_TIMING_FILTERS } from "./schemas";

export const LEAVE_CLASSES = ["LICENCIA", "AUSENCIA", "VACACIONES", "SUSPENSION"] as const;
export type LeaveClass = (typeof LEAVE_CLASSES)[number];

export const LEAVE_CLASS_LABELS: Record<LeaveClass, string> = {
  LICENCIA: "Licencia",
  AUSENCIA: "Ausencia",
  VACACIONES: "Vacaciones",
  SUSPENSION: "Suspensión",
};

export const COUNTING_MODE_LABELS = { CORRIDOS: "Días corridos", HABILES: "Días hábiles" } as const;

export const LEAVE_STATUSES = ["SOLICITADA", "APROBADA", "RECHAZADA", "ANULADA"] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
  SOLICITADA: "Solicitada",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
  ANULADA: "Anulada",
};

export const LEAVE_TIMING_LABELS = { PROXIMA: "Próxima", EN_CURSO: "En curso", FINALIZADA: "Finalizada" } as const;

/** Nombre que ve quien no puede ver datos de salud en lugar del tipo sensible. */
export const RESERVED_TYPE_LABEL = "Licencia (dato reservado)";

/** Filtros del listado: valor en la URL → texto (los usan los filtros y la exportación). */
export const LEAVE_STATUS_FILTER_LABELS: Record<(typeof LEAVE_STATUS_FILTERS)[number], string> = {
  vigentes: "Solicitadas y aprobadas",
  pendientes: "Pendientes de aprobación",
  aprobadas: "Aprobadas",
  rechazadas: "Rechazadas",
  anuladas: "Anuladas",
  todas: "Todas",
};

export const LEAVE_CLASS_FILTER_LABELS: Record<(typeof LEAVE_CLASS_FILTERS)[number], string> = {
  licencias: "Licencias",
  ausencias: "Ausencias",
  vacaciones: "Vacaciones",
  suspensiones: "Suspensiones",
};

export const LEAVE_TIMING_FILTER_LABELS: Record<(typeof LEAVE_TIMING_FILTERS)[number], string> = {
  "en-curso": "En curso hoy",
  proximas: "Próximas",
  finalizadas: "Finalizadas",
};

export const EXIT_STATUSES = ["EN_TRAMITE", "CONFIRMADO", "ANULADO"] as const;
export type ExitStatus = (typeof EXIT_STATUSES)[number];

export const EXIT_STATUS_LABELS: Record<ExitStatus, string> = {
  EN_TRAMITE: "En trámite",
  CONFIRMADO: "Confirmado",
  ANULADO: "Anulado",
};

/** Grupos de `LookupValue` con los tipos y motivos de egreso (Configuración → Catálogos). */
export const EXIT_TYPE_GROUP = "TIPO_EGRESO";
export const EXIT_REASON_GROUP = "MOTIVO_EGRESO";

export const ATTENDANCE_STATUSES = ["PRESENTE", "AUSENTE", "JUSTIFICADO", "FRANCO", "FERIADO"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  PRESENTE: "Presente",
  AUSENTE: "Ausente",
  JUSTIFICADO: "Con licencia",
  FRANCO: "Franco",
  FERIADO: "Feriado",
};

export const ATTENDANCE_SOURCE_LABELS = { MANUAL: "Carga manual", IMPORT: "Importado" } as const;

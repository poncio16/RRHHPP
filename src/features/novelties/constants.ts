/** Valores fijos de novedades, compartidos entre cliente y servidor. */

export const NOVELTY_STATUSES = ["PENDIENTE", "APROBADA", "INFORMADA", "ANULADA"] as const;
export type NoveltyStatus = (typeof NOVELTY_STATUSES)[number];

export const NOVELTY_STATUS_LABELS: Record<NoveltyStatus, string> = {
  PENDIENTE: "Pendiente",
  APROBADA: "Aprobada",
  INFORMADA: "Informada",
  ANULADA: "Anulada",
};

/** Hechos de Asistencia y del legajo que generan novedades (uno por tipo de novedad). */
export const NOVELTY_ORIGIN_LABELS = {
  HORAS_EXTRAS: "Horas adicionales de asistencia",
  LLEGADAS_TARDE: "Llegadas tarde de asistencia",
  AUSENCIAS: "Ausencias de asistencia (sin licencia)",
  CAMBIO_SALARIAL: "Cambios de sueldo básico",
  CAMBIO_CATEGORIA: "Cambios de categoría del legajo",
} as const;
export type NoveltyOrigin = keyof typeof NOVELTY_ORIGIN_LABELS;

/** Origen guardado en `novelty.source_type` de las novedades generadas. */
export const NOVELTY_SOURCES = {
  LEAVE: "LEAVE",
  ATTENDANCE_EXTRA: "ATTENDANCE_EXTRA",
  ATTENDANCE_LATE: "ATTENDANCE_LATE",
  ATTENDANCE_ABSENCE: "ATTENDANCE_ABSENCE",
  SALARY_HISTORY: "SALARY_HISTORY",
  CATEGORY_CHANGE: "CATEGORY_CHANGE",
} as const;
export type NoveltySource = keyof typeof NOVELTY_SOURCES;

export const NOVELTY_SOURCE_LABELS: Record<NoveltySource, string> = {
  LEAVE: "Licencias y ausencias",
  ATTENDANCE_EXTRA: "Asistencia",
  ATTENDANCE_LATE: "Asistencia",
  ATTENDANCE_ABSENCE: "Asistencia",
  SALARY_HISTORY: "Información salarial",
  CATEGORY_CHANGE: "Historial laboral",
};

export const isNoveltySource = (value: string | null): value is NoveltySource =>
  value !== null && value in NOVELTY_SOURCES;

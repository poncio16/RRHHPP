/** Valores fijos del legajo, compartidos entre cliente y servidor. */

export const SEX_OPTIONS = [
  { value: "F", label: "Femenino" },
  { value: "M", label: "Masculino" },
  { value: "X", label: "X (no binario)" },
] as const;
export type SexValue = (typeof SEX_OPTIONS)[number]["value"];

export const STATUS_LABELS = { ACTIVO: "Activo", EGRESADO: "Egresado" } as const;

/**
 * Campos que generan historial laboral al cambiar, con su tipo de cambio y
 * su etiqueta. Al editarlos se pide fecha efectiva y observaciones.
 */
export const HISTORIC_FIELDS = {
  departmentId: { type: "SECTOR", label: "Sector" },
  positionId: { type: "PUESTO", label: "Puesto" },
  categoryId: { type: "CATEGORIA", label: "Categoría" },
  agreementId: { type: "CONVENIO", label: "Convenio" },
  contractTypeId: { type: "CONTRATACION", label: "Tipo de contrato" },
  contractEndDate: { type: "CONTRATACION", label: "Fin de contrato" },
  workdayTypeId: { type: "JORNADA", label: "Jornada" },
  workScheduleId: { type: "HORARIO", label: "Horario" },
  workModalityId: { type: "MODALIDAD", label: "Modalidad" },
  workplaceId: { type: "ESTABLECIMIENTO", label: "Establecimiento" },
  supervisorId: { type: "SUPERIOR", label: "Superior directo" },
} as const;
export type HistoricField = keyof typeof HISTORIC_FIELDS;
export const HISTORIC_FIELD_NAMES = Object.keys(HISTORIC_FIELDS) as HistoricField[];

export const CHANGE_TYPE_LABELS: Record<string, string> = {
  PUESTO: "Puesto",
  SECTOR: "Sector",
  CATEGORIA: "Categoría",
  JORNADA: "Jornada",
  HORARIO: "Horario",
  MODALIDAD: "Modalidad",
  ESTABLECIMIENTO: "Establecimiento",
  CONTRATACION: "Contratación",
  CONVENIO: "Convenio",
  SUPERIOR: "Superior",
  DATOS_BANCARIOS: "Datos bancarios",
  REINGRESO: "Reingreso",
  OTRO: "Otro",
};

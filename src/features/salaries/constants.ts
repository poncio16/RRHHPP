/** Valores fijos de remuneraciones, compartidos entre cliente y servidor. */

export const CONCEPT_NATURES = ["HABER", "DESCUENTO", "INFORMATIVO"] as const;
export type ConceptNature = (typeof CONCEPT_NATURES)[number];

export const CONCEPT_NATURE_LABELS: Record<ConceptNature, string> = {
  HABER: "Haber",
  DESCUENTO: "Descuento",
  INFORMATIVO: "Informativo",
};

export const SALARY_CONCEPT_KIND_LABELS = {
  BASICO: "Sueldo básico",
  ADICIONAL: "Adicional",
  BONIFICACION: "Bonificación",
  PREMIO: "Premio",
  HORAS_EXTRAS: "Horas extras",
  OTRO: "Otro concepto",
} as const;

/** Rótulo fijo de las pantallas de remuneraciones (docs/arquitectura.md §2.3). */
export const SALARY_DISCLAIMER =
  "Información informada por el sistema de liquidación de la empresa. No constituye liquidación de haberes.";

/** Renglones de conceptos por resumen. */
export const MAX_PAYROLL_LINES = 40;

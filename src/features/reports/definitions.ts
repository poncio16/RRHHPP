import type { Permission } from "@/server/authz/permissions";

export const REPORT_SLUGS = [
  "dotacion",
  "altas-y-bajas",
  "ausentismo",
  "vacaciones",
  "vencimientos",
  "antiguedad",
  "remuneraciones",
] as const;
export type ReportSlug = (typeof REPORT_SLUGS)[number];

export type ReportDefinition = {
  title: string;
  description: string;
  /** Permisos necesarios (todos). */
  permissions: Permission[];
};

export const REPORTS: Record<ReportSlug, ReportDefinition> = {
  dotacion: {
    title: "Dotación",
    description: "Personal activo por sector, puesto, categoría y establecimiento, con el detalle.",
    permissions: ["report:headcount"],
  },
  "altas-y-bajas": {
    title: "Altas y bajas",
    description: "Ingresos, reingresos y egresos confirmados por período, con la evolución mensual de la dotación.",
    permissions: ["report:movements"],
  },
  ausentismo: {
    title: "Ausentismo",
    description: "Días de ausencia sobre días previstos, por empleado, por sector y por tipo.",
    permissions: ["report:absenteeism"],
  },
  vacaciones: {
    title: "Vacaciones",
    description: "Días disponibles, utilizados, solicitados y pendientes de cada período.",
    permissions: ["report:vacations"],
  },
  vencimientos: {
    title: "Vencimientos",
    description: "Documentos, licencias y contratos a plazo que vencen o terminan entre dos fechas.",
    permissions: ["report:expirations"],
  },
  antiguedad: {
    title: "Antigüedad",
    description: "Personal activo por rangos de antigüedad configurables.",
    permissions: ["report:seniority"],
  },
  remuneraciones: {
    title: "Remuneraciones informadas",
    description: "Bruto, descuentos y neto informados por el sistema de liquidación, por sector y por empleado.",
    permissions: ["report:salary", "salary:read"],
  },
};

export const isReportSlug = (value: string): value is ReportSlug => (REPORT_SLUGS as readonly string[]).includes(value);

/** Rótulo fijo de las pantallas y exportaciones con importes informados (diseño, sección de riesgos). */
export const SALARY_NOTICE = "Información informada — no constituye liquidación de haberes.";

import type { Permission } from "@/server/authz/permissions";

export const ALERT_KINDS = [
  "DOCUMENTO",
  "LICENCIA",
  "VACACIONES",
  "PERIODO_VACACIONES",
  "CONTRATO",
  "CUMPLEANOS",
  "LEGAJO",
] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

export const ALERT_KIND_LABELS: Record<AlertKind, string> = {
  DOCUMENTO: "Documentos por vencer o vencidos",
  LICENCIA: "Licencias que terminan",
  VACACIONES: "Vacaciones próximas",
  PERIODO_VACACIONES: "Vacaciones pendientes de años anteriores",
  CONTRATO: "Contratos a plazo que terminan",
  CUMPLEANOS: "Cumpleaños",
  LEGAJO: "Legajos incompletos",
};

/** Permiso para ver cada clase de alerta y para descartarla o posponerla. */
export const ALERT_PERMISSIONS: Record<AlertKind, { read: Permission; manage: Permission }> = {
  DOCUMENTO: { read: "document:read", manage: "document:write" },
  LICENCIA: { read: "leave:read", manage: "leave:write" },
  VACACIONES: { read: "leave:read", manage: "leave:write" },
  PERIODO_VACACIONES: { read: "leave:read", manage: "leave:write" },
  CONTRATO: { read: "employee:read", manage: "employee:write" },
  CUMPLEANOS: { read: "employee.personal:read", manage: "employee:write" },
  LEGAJO: { read: "employee:read", manage: "employee:write" },
};

/** Días que se pospone una alerta. */
export const SNOOZE_DAYS = 7;

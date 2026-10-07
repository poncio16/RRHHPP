import type { RowStatus } from "./map";

export const JOB_STATUS = {
  VALIDADO: { label: "Pendiente de confirmar", variant: "warning" },
  CONFIRMADO: { label: "Confirmada", variant: "success" },
  DESCARTADO: { label: "Descartada", variant: "muted" },
} as const;

export const ROW_STATUS: Record<
  RowStatus,
  { label: string; variant: "success" | "destructive" | "warning" | "default" }
> = {
  VALIDA: { label: "Válida", variant: "success" },
  ERROR: { label: "Con errores", variant: "destructive" },
  DUPLICADA: { label: "Duplicada", variant: "warning" },
  CREADA: { label: "Creada", variant: "default" },
};

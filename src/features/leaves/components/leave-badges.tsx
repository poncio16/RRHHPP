import { Badge } from "@/components/ui/badge";
import { LEAVE_STATUS_LABELS, LEAVE_TIMING_LABELS, type LeaveStatus } from "../constants";
import type { LeaveTiming } from "../days";

const STATUS_VARIANT = {
  SOLICITADA: "warning",
  APROBADA: "success",
  RECHAZADA: "destructive",
  ANULADA: "muted",
} as const;

export function LeaveStatusBadge({ status }: { status: LeaveStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{LEAVE_STATUS_LABELS[status]}</Badge>;
}

/** "En curso" o "Próxima" solo tienen sentido para registros vigentes. */
export function LeaveTimingBadge({ timing, status }: { timing: LeaveTiming; status: LeaveStatus }) {
  if (status === "RECHAZADA" || status === "ANULADA" || timing === "FINALIZADA") return null;
  return <Badge variant={timing === "EN_CURSO" ? "default" : "muted"}>{LEAVE_TIMING_LABELS[timing]}</Badge>;
}

export function CertificateBadge({ state }: { state: "PRESENTADO" | "FALTA" | null }) {
  if (!state) return null;
  return state === "FALTA" ? (
    <Badge variant="warning">Falta certificado</Badge>
  ) : (
    <Badge variant="muted">Certificado presentado</Badge>
  );
}

import { Badge } from "@/components/ui/badge";
import { DOCUMENT_STATUS_LABELS, EXPIRY_LABELS, type DocumentStatus } from "../constants";
import type { ExpiryState } from "../expiry";

const EXPIRY_VARIANT = {
  SIN_VENCIMIENTO: "muted",
  VIGENTE: "success",
  POR_VENCER: "warning",
  VENCIDO: "destructive",
} as const;

const STATUS_VARIANT = {
  PRESENTADO: "default",
  PENDIENTE: "warning",
  OBSERVADO: "destructive",
  ANULADO: "muted",
} as const;

export function ExpiryBadge({ state }: { state: ExpiryState | null }) {
  if (!state || state === "SIN_VENCIMIENTO") return null;
  return <Badge variant={EXPIRY_VARIANT[state]}>{EXPIRY_LABELS[state]}</Badge>;
}

export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{DOCUMENT_STATUS_LABELS[status]}</Badge>;
}

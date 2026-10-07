import { Badge } from "@/components/ui/badge";
import { EXIT_STATUS_LABELS, type ExitStatus } from "../constants";

const STATUS_VARIANT = { EN_TRAMITE: "warning", CONFIRMADO: "destructive", ANULADO: "muted" } as const;

export function ExitStatusBadge({ status }: { status: ExitStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{EXIT_STATUS_LABELS[status]}</Badge>;
}

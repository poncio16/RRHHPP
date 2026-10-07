import { Badge } from "@/components/ui/badge";
import { NOVELTY_STATUS_LABELS, type NoveltyStatus } from "../constants";

const STATUS_VARIANT = {
  PENDIENTE: "warning",
  APROBADA: "default",
  INFORMADA: "success",
  ANULADA: "muted",
} as const;

export function NoveltyStatusBadge({ status }: { status: NoveltyStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{NOVELTY_STATUS_LABELS[status]}</Badge>;
}

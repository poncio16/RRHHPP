import { Badge } from "@/components/ui/badge";
import { ATTENDANCE_STATUS_LABELS, type AttendanceStatus } from "../constants";

const STATUS_VARIANT = {
  PRESENTE: "success",
  AUSENTE: "destructive",
  JUSTIFICADO: "default",
  FRANCO: "muted",
  FERIADO: "muted",
} as const;

export function AttendanceStatusBadge({ status }: { status: AttendanceStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{ATTENDANCE_STATUS_LABELS[status]}</Badge>;
}

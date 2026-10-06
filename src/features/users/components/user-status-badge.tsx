import { Badge } from "@/components/ui/badge";

export function UserStatusBadge({
  isActive,
  lockedUntil,
  mustChangePassword,
}: {
  isActive: boolean;
  lockedUntil: Date | null;
  mustChangePassword: boolean;
}) {
  if (!isActive) return <Badge variant="muted">Inactivo</Badge>;
  if (lockedUntil && lockedUntil > new Date()) return <Badge variant="destructive">Bloqueado</Badge>;
  if (mustChangePassword) return <Badge variant="warning">Clave temporal</Badge>;
  return <Badge variant="success">Activo</Badge>;
}

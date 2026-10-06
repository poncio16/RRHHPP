import "server-only";
import { recordAudit } from "../audit";
import type { ActorContext } from "../context";
import { ForbiddenError } from "../errors";
import type { Permission } from "./permissions";

export * from "./permissions";
export { ADMIN_ROLE, DEFAULT_ROLES, effectivePermissions } from "./roles";

export function hasPermission(ctx: ActorContext, permission: Permission): boolean {
  return ctx.permissions.has(permission);
}

/**
 * Verifica el permiso en el servidor. Si falta, registra el intento en la
 * auditoría y lanza ForbiddenError: ocultar un botón nunca es la barrera.
 */
export async function assertPermission(ctx: ActorContext, permission: Permission, module: string): Promise<void> {
  if (hasPermission(ctx, permission)) return;
  await recordAudit(ctx, {
    action: "ACCESS_DENIED",
    module,
    result: "DENIED",
    message: `Falta el permiso ${permission}`,
  });
  throw new ForbiddenError();
}

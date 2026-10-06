import "server-only";
import { recordAudit } from "@/server/audit";
import { ADMIN_ROLE, assertPermission, effectivePermissions } from "@/server/authz";
import type { ActorContext } from "@/server/context";
import { BusinessRuleError, NotFoundError } from "@/server/errors";
import * as repo from "./repository";
import { updateRolePermissionsSchema } from "./schemas";

const MODULE = "usuarios";

export async function listRoles(ctx: ActorContext) {
  await assertPermission(ctx, "user:manage", MODULE);
  const roles = await repo.listRolesWithPermissions();
  return roles.map((role) => ({
    id: role.id,
    code: role.code,
    name: role.name,
    description: role.description,
    activeUsers: role._count.users,
    editable: role.code !== ADMIN_ROLE,
    permissions: [
      ...effectivePermissions(
        role.code,
        role.permissions.map((p) => p.permission),
      ),
    ],
  }));
}

/** Reemplaza los permisos de un rol. El rol Administrador no se edita: siempre tiene todos. */
export async function updateRolePermissions(ctx: ActorContext, input: unknown) {
  await assertPermission(ctx, "user:manage", MODULE);
  const { roleId, permissions } = updateRolePermissionsSchema.parse(input);

  await repo.transaction(async (tx) => {
    const role = await repo.findRole(roleId, tx);
    if (!role) throw new NotFoundError("El rol no existe.");
    if (role.code === ADMIN_ROLE) throw new BusinessRuleError("El rol Administrador tiene siempre todos los permisos.");

    const before = role.permissions.map((p) => p.permission).sort();
    if (JSON.stringify(before) === JSON.stringify(permissions)) return;

    await repo.replaceRolePermissions(roleId, permissions, tx);
    await recordAudit(
      ctx,
      {
        action: "PERMISSION_CHANGE",
        module: MODULE,
        entityType: "Role",
        entityId: roleId,
        before: { permissions: before },
        after: { permissions },
        message: `Permisos del rol ${role.name}`,
      },
      tx,
    );
  });
}

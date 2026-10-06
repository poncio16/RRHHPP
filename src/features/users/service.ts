import "server-only";
import { paginate } from "@/lib/list/query";
import { auditDiff, recordAudit, sanitizeForAudit } from "@/server/audit";
import { generateTemporaryPassword, hashPassword } from "@/server/auth/password";
import { revokeSession, revokeUserSessions } from "@/server/auth/sessions";
import { ADMIN_ROLE, assertPermission } from "@/server/authz";
import type { ActorContext } from "@/server/context";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/server/errors";
import * as repo from "./repository";
import { createUserSchema, updateUserSchema, userListQuerySchema } from "./schemas";

const MODULE = "usuarios";
const PERMISSION = "user:manage";

/** Campos del usuario que se comparan en la auditoría. */
const auditable = (u: { name: string; email: string; roleId: string; isActive: boolean }) => ({
  name: u.name,
  email: u.email,
  roleId: u.roleId,
  isActive: u.isActive,
});

export async function listUsers(ctx: ActorContext, rawQuery: unknown) {
  await assertPermission(ctx, PERMISSION, MODULE);
  const query = userListQuerySchema.parse(rawQuery);
  const { items, total } = await repo.listUsers(query);
  return { ...paginate(items, total, query.page, query.pageSize), query };
}

export async function getUser(ctx: ActorContext, id: string) {
  await assertPermission(ctx, PERMISSION, MODULE);
  const user = await repo.findUserDetail(id);
  if (!user) throw new NotFoundError("El usuario no existe.");
  return user;
}

export async function listRoleOptions(ctx: ActorContext) {
  await assertPermission(ctx, PERMISSION, MODULE);
  return repo.listRolesForSelect();
}

/** Alta con contraseña temporal generada: se muestra una sola vez y se exige cambiarla al ingresar. */
export async function createUser(ctx: ActorContext, input: unknown) {
  await assertPermission(ctx, PERMISSION, MODULE);
  const data = createUserSchema.parse(input);
  const role = await repo.findRoleById(data.roleId);
  if (!role) throw new ValidationError(undefined, { roleId: ["El rol elegido no existe."] });

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  const user = await repo.transaction(async (tx) => {
    const created = await repo.insertUser({ ...data, passwordHash, mustChangePassword: true }, tx);
    await recordAudit(
      ctx,
      {
        action: "CREATE",
        module: MODULE,
        entityType: "User",
        entityId: created.id,
        after: { ...sanitizeForAudit(auditable(created)), role: role.name },
      },
      tx,
    );
    return created;
  });

  return { id: user.id, temporaryPassword };
}

export async function updateUser(ctx: ActorContext, id: string, input: unknown) {
  await assertPermission(ctx, PERMISSION, MODULE);
  const data = updateUserSchema.parse(input);

  await repo.transaction(async (tx) => {
    const current = await repo.findUserById(id, tx);
    if (!current) throw new NotFoundError("El usuario no existe.");
    const role = await repo.findRoleById(data.roleId, tx);
    if (!role) throw new ValidationError(undefined, { roleId: ["El rol elegido no existe."] });

    const isSelf = current.id === ctx.userId;
    if (isSelf && !data.isActive) throw new BusinessRuleError("No podés desactivar tu propio usuario.");
    if (isSelf && data.roleId !== current.roleId) throw new BusinessRuleError("No podés cambiar tu propio rol.");

    const losesAdmin =
      current.role.code === ADMIN_ROLE && current.isActive && (role.code !== ADMIN_ROLE || !data.isActive);
    if (losesAdmin && (await repo.countOtherActiveAdmins(tx, current.id, ADMIN_ROLE)) === 0) {
      throw new BusinessRuleError("Tiene que quedar al menos un administrador activo.");
    }

    const updated = await repo.updateUserById(id, data, tx);
    const diff = auditDiff(auditable(current), auditable(updated));
    if (diff) {
      const roleChanged = current.roleId !== updated.roleId;
      await recordAudit(
        ctx,
        {
          action: roleChanged ? "PERMISSION_CHANGE" : "UPDATE",
          module: MODULE,
          entityType: "User",
          entityId: id,
          before: roleChanged ? { ...diff.before, role: current.role.name } : diff.before,
          after: roleChanged ? { ...diff.after, role: role.name } : diff.after,
        },
        tx,
      );
    }
  });

  // Un usuario desactivado pierde sus sesiones al instante.
  if (!data.isActive) await revokeUserSessions(id);
}

/** Genera una contraseña temporal nueva, desbloquea la cuenta y cierra sus sesiones. */
export async function resetPassword(ctx: ActorContext, id: string) {
  await assertPermission(ctx, PERMISSION, MODULE);
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  await repo.transaction(async (tx) => {
    const current = await repo.findUserById(id, tx);
    if (!current) throw new NotFoundError("El usuario no existe.");
    await repo.updateUserById(
      id,
      { passwordHash, mustChangePassword: true, failedLoginCount: 0, lockedUntil: null },
      tx,
    );
    await recordAudit(
      ctx,
      { action: "UPDATE", module: MODULE, entityType: "User", entityId: id, message: "Restablecimiento de contraseña" },
      tx,
    );
  });
  await revokeUserSessions(id);
  return { temporaryPassword };
}

export async function unlockUser(ctx: ActorContext, id: string) {
  await assertPermission(ctx, PERMISSION, MODULE);
  await repo.transaction(async (tx) => {
    const current = await repo.findUserById(id, tx);
    if (!current) throw new NotFoundError("El usuario no existe.");
    await repo.updateUserById(id, { failedLoginCount: 0, lockedUntil: null }, tx);
    await recordAudit(
      ctx,
      { action: "UPDATE", module: MODULE, entityType: "User", entityId: id, message: "Desbloqueo de cuenta" },
      tx,
    );
  });
}

/** Cierra una sesión puntual o todas las del usuario. */
export async function revokeSessions(ctx: ActorContext, userId: string, sessionId?: string) {
  await assertPermission(ctx, PERMISSION, MODULE);
  const user = await repo.findUserById(userId);
  if (!user) throw new NotFoundError("El usuario no existe.");
  if (sessionId) await revokeSession(sessionId, userId);
  else await revokeUserSessions(userId);
  await recordAudit(ctx, {
    action: "UPDATE",
    module: MODULE,
    entityType: "User",
    entityId: userId,
    message: sessionId ? "Cierre de una sesión" : "Cierre de todas las sesiones",
  });
}

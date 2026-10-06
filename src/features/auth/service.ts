import "server-only";
import { recordAudit } from "@/server/audit";
import { hashPassword, verifyPassword, getDummyHash } from "@/server/auth/password";
import { createSession, revokeSession, revokeUserSessions } from "@/server/auth/sessions";
import type { ActorContext, RequestMeta } from "@/server/context";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/server/errors";
import { getSetting } from "@/server/settings";
import * as repo from "./repository";
import { changePasswordSchema, loginSchema } from "./schemas";

const MODULE = "autenticacion";
const INVALID_CREDENTIALS = "Email o contraseña incorrectos.";

export type LoginResult = { token: string; expiresAt: Date; mustChangePassword: boolean };

/**
 * Inicio de sesión con bloqueo temporal por intentos fallidos. El mensaje de
 * error es el mismo para email inexistente, contraseña incorrecta o usuario
 * inactivo, para no revelar qué cuentas existen.
 */
export async function login(input: unknown, meta: RequestMeta, now = new Date()): Promise<LoginResult> {
  const { email, password } = loginSchema.parse(input);
  const security = await getSetting("security");
  const user = await repo.findUserByEmail(email);

  const fail = async (userId: string | null, message: string) => {
    await recordAudit(
      { ...meta, userId, email },
      { action: "LOGIN_FAILED", module: MODULE, result: "FAILURE", message },
    );
  };

  if (!user) {
    await verifyPassword(await getDummyHash(), password);
    await fail(null, "Email inexistente");
    throw new ValidationError(INVALID_CREDENTIALS);
  }

  if (user.lockedUntil && user.lockedUntil > now) {
    await fail(user.id, "Cuenta bloqueada temporalmente");
    throw new BusinessRuleError(
      "La cuenta está bloqueada temporalmente por varios intentos fallidos. Probá de nuevo más tarde o pedí al administrador que la desbloquee.",
    );
  }

  const valid = await verifyPassword(user.passwordHash, password);

  if (!user.isActive) {
    await fail(user.id, "Usuario inactivo");
    throw new ValidationError(INVALID_CREDENTIALS);
  }

  if (!valid) {
    const attempts = user.failedLoginCount + 1;
    const lock = attempts >= security.maxFailedLogins;
    await repo.updateUser(
      user.id,
      lock
        ? { failedLoginCount: 0, lockedUntil: new Date(now.getTime() + security.lockMinutes * 60_000) }
        : { failedLoginCount: attempts },
    );
    await fail(
      user.id,
      lock ? `Contraseña incorrecta; cuenta bloqueada por ${security.lockMinutes} min` : "Contraseña incorrecta",
    );
    throw new ValidationError(INVALID_CREDENTIALS);
  }

  await repo.updateUser(user.id, { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now });
  const session = await createSession(user.id, meta, now);
  await recordAudit(
    { ...meta, userId: user.id, email },
    { action: "LOGIN", module: MODULE, entityType: "Session", entityId: session.sessionId },
  );

  return { token: session.token, expiresAt: session.expiresAt, mustChangePassword: user.mustChangePassword };
}

export async function logout(ctx: ActorContext): Promise<void> {
  await revokeSession(ctx.sessionId);
  await recordAudit(ctx, { action: "LOGOUT", module: MODULE, entityType: "Session", entityId: ctx.sessionId });
}

/** Cambio de contraseña propio. Cierra las demás sesiones del usuario. */
export async function changeOwnPassword(ctx: ActorContext, input: unknown): Promise<void> {
  const { passwordMinLength } = await getSetting("security");
  const data = changePasswordSchema(passwordMinLength).parse(input);

  const user = await repo.findUserById(ctx.userId);
  if (!user) throw new NotFoundError();
  if (!(await verifyPassword(user.passwordHash, data.currentPassword))) {
    throw new ValidationError("La contraseña actual no es correcta.", {
      currentPassword: ["La contraseña actual no es correcta."],
    });
  }

  const passwordHash = await hashPassword(data.newPassword);
  await repo.transaction(async (tx) => {
    await repo.updateUser(user.id, { passwordHash, mustChangePassword: false }, tx);
    await recordAudit(
      ctx,
      {
        action: "UPDATE",
        module: MODULE,
        entityType: "User",
        entityId: user.id,
        message: "Cambio de contraseña propia",
      },
      tx,
    );
  });
  await revokeUserSessions(user.id, ctx.sessionId);
}

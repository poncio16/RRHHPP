import "server-only";
import { recordAudit } from "@/server/audit";
import { hashPassword, verifyPassword, getDummyHash } from "@/server/auth/password";
import { createSession, revokeSession, revokeUserSessions } from "@/server/auth/sessions";
import type { ActorContext, RequestMeta } from "@/server/context";
import { NotFoundError, ValidationError } from "@/server/errors";
import { getSetting } from "@/server/settings";
import * as repo from "./repository";
import { changePasswordSchema, loginSchema } from "./schemas";

const MODULE = "autenticacion";
const INVALID_CREDENTIALS =
  "Email o contraseña incorrectos. Después de varios intentos fallidos la cuenta se bloquea por un tiempo.";

export type LoginResult = { token: string; expiresAt: Date; mustChangePassword: boolean };

/**
 * Inicio de sesión con bloqueo temporal por intentos fallidos. El mensaje de
 * error es el mismo para email inexistente, contraseña incorrecta, usuario
 * inactivo o cuenta bloqueada, para no revelar qué cuentas existen. El intento
 * se cuenta antes de verificar la contraseña: pedidos simultáneos no pueden
 * probar más claves que las permitidas.
 */
export async function login(input: unknown, meta: RequestMeta, now = new Date()): Promise<LoginResult> {
  const { email, password } = loginSchema.parse(input);
  const security = await getSetting("security");
  const user = await repo.findUserByEmail(email);

  const reject = async (userId: string | null, message: string): Promise<never> => {
    await recordAudit(
      { ...meta, userId, email },
      { action: "LOGIN_FAILED", module: MODULE, result: "FAILURE", message },
    );
    throw new ValidationError(INVALID_CREDENTIALS);
  };
  // Mismo costo que una verificación real, para no distinguir los casos por el tiempo.
  const spendDummyCheck = async () => {
    await verifyPassword(await getDummyHash(), password);
  };

  if (!user) {
    await spendDummyCheck();
    return reject(null, "Email inexistente");
  }
  if (!user.isActive) {
    await spendDummyCheck();
    return reject(user.id, "Usuario inactivo");
  }
  if (user.lockedUntil && user.lockedUntil > now) {
    await spendDummyCheck();
    return reject(user.id, "Cuenta bloqueada temporalmente");
  }

  const lockMessage = `cuenta bloqueada por ${security.lockMinutes} min`;
  const lockAccount = () =>
    repo.updateUser(user.id, {
      failedLoginCount: 0,
      lockedUntil: new Date(now.getTime() + security.lockMinutes * 60_000),
    });

  const attempts = await repo.addLoginAttempt(user.id);
  if (attempts > security.maxFailedLogins) {
    // Pedidos simultáneos que pasaron el límite: ni se verifica la contraseña.
    await spendDummyCheck();
    await lockAccount();
    return reject(user.id, `Intentos simultáneos por encima del límite; ${lockMessage}`);
  }

  if (!(await verifyPassword(user.passwordHash, password))) {
    const lock = attempts >= security.maxFailedLogins;
    if (lock) await lockAccount();
    return reject(user.id, lock ? `Contraseña incorrecta; ${lockMessage}` : "Contraseña incorrecta");
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

import { hash } from "@node-rs/argon2";
import type { Prisma, PrismaClient } from "../../src/generated/prisma/client";
import { newPasswordSchema } from "../../src/features/auth/schemas";
import { createUserSchema } from "../../src/features/users/schemas";
import { auditDiff, sanitizeForAudit } from "../../src/server/audit/mask";
import { ARGON2_OPTIONS } from "../../src/server/auth/argon2-options";
import { ADMIN_ROLE } from "../../src/server/authz/roles";
import { SETTING_DEFINITIONS, defaultSetting } from "../../src/server/settings/definitions";

const MODULE = "usuarios";
const MESSAGE = "Recuperación de acceso desde la consola del servidor";

/** Error esperable (datos inválidos o base sin preparar): se informa sin traza. */
export class AdminRecoveryError extends Error {}

export type RecoverAdminInput = { email: string; password: string; now?: Date };

export type RecoverAdminResult = {
  action: "CREATE" | "UPDATE";
  userId: string;
  email: string;
  revokedSessions: number;
};

/**
 * Largo mínimo de contraseña del parámetro "security". Replica `getSetting`
 * (src/server/settings), que no se puede importar fuera de Next porque es
 * "server-only" y usa el cliente de la aplicación: si la fila falta o es
 * inválida, se usa el valor por defecto.
 */
async function passwordMinLength(db: Pick<PrismaClient, "setting">): Promise<number> {
  const row = await db.setting.findUnique({ where: { key: "security" } });
  const parsed = row ? SETTING_DEFINITIONS.security.schema.safeParse(row.value) : null;
  return (parsed?.success ? parsed.data : defaultSetting("security")).passwordMinLength;
}

const sessions = (n: number) => `${n} ${n === 1 ? "sesión cerrada" : "sesiones cerradas"}`;

/** Campos del usuario que se comparan en la auditoría (nunca el hash de la contraseña). */
const auditable = (u: {
  name: string;
  email: string;
  roleId: string;
  isActive: boolean;
  mustChangePassword: boolean;
  failedLoginCount: number;
  lockedUntil: Date | null;
}) => ({
  name: u.name,
  email: u.email,
  roleId: u.roleId,
  isActive: u.isActive,
  mustChangePassword: u.mustChangePassword,
  failedLoginCount: u.failedLoginCount,
  lockedUntil: u.lockedUntil,
});

/**
 * Recupera el acceso de un administrador desde la consola del servidor (no
 * hay recuperación por email). Si el email existe: contraseña nueva, rol
 * Administrador, cuenta activa y desbloqueada, cambio de contraseña obligatorio
 * al ingresar y todas sus sesiones cerradas. Si no existe, crea el usuario
 * administrador. La contraseña cumple la misma política que en la aplicación.
 * Todo se guarda en una transacción junto con su registro de auditoría, que no
 * incluye la contraseña ni su hash.
 */
export async function recoverAdmin(db: PrismaClient, input: RecoverAdminInput): Promise<RecoverAdminResult> {
  const email = createUserSchema.shape.email.safeParse(input.email);
  if (!email.success) throw new AdminRecoveryError(`ADMIN_EMAIL: ${email.error.issues[0]!.message}`);

  const minLength = await passwordMinLength(db);
  const password = newPasswordSchema(minLength).safeParse(input.password);
  if (!password.success) {
    throw new AdminRecoveryError(`ADMIN_PASSWORD: ${password.error.issues.map((i) => i.message).join(" ")}`);
  }

  const now = input.now ?? new Date();
  const passwordHash = await hash(password.data, ARGON2_OPTIONS);

  return db.$transaction(async (tx) => {
    const role = await tx.role.findUnique({ where: { code: ADMIN_ROLE } });
    if (!role) {
      throw new AdminRecoveryError(
        "No existe el rol Administrador: aplicá las migraciones y cargá los datos base (npm run db:seed:base).",
      );
    }

    const current = await tx.user.findUnique({ where: { email: email.data }, include: { role: true } });
    if (!current) {
      const created = await tx.user.create({
        data: { email: email.data, name: "Administrador", passwordHash, roleId: role.id, mustChangePassword: true },
      });
      await insertAudit(tx, {
        action: "CREATE",
        entityId: created.id,
        after: { ...sanitizeForAudit(auditable(created)), role: role.name },
        message: `${MESSAGE}: alta del administrador`,
      });
      return { action: "CREATE", userId: created.id, email: created.email, revokedSessions: 0 };
    }

    const updated = await tx.user.update({
      where: { id: current.id },
      data: {
        passwordHash,
        mustChangePassword: true,
        isActive: true,
        failedLoginCount: 0,
        lockedUntil: null,
        roleId: role.id,
      },
    });
    const { count: revokedSessions } = await tx.session.updateMany({
      where: { userId: current.id, revokedAt: null },
      data: { revokedAt: now },
    });
    const diff = auditDiff(auditable(current), auditable(updated));
    const roleChanged = current.roleId !== role.id;
    await insertAudit(tx, {
      action: "UPDATE",
      entityId: current.id,
      before: diff && roleChanged ? { ...diff.before, role: current.role.name } : (diff?.before ?? null),
      after: diff && roleChanged ? { ...diff.after, role: role.name } : (diff?.after ?? null),
      message: `${MESSAGE}: contraseña restablecida${revokedSessions > 0 ? ` y ${sessions(revokedSessions)}` : ""}`,
    });
    return { action: "UPDATE", userId: current.id, email: current.email, revokedSessions };
  });
}

/**
 * Mismas columnas que `recordAudit` (src/server/audit), que no se puede
 * importar fuera de Next. No hay usuario ni petición: userId, email, IP y
 * navegador quedan vacíos y el mensaje indica el origen.
 */
async function insertAudit(
  tx: Prisma.TransactionClient,
  entry: {
    action: "CREATE" | "UPDATE";
    entityId: string;
    before?: Prisma.InputJsonValue | null;
    after?: Prisma.InputJsonValue | null;
    message: string;
  },
) {
  await tx.auditLog.create({
    data: {
      userId: null,
      userEmail: null,
      ip: null,
      userAgent: null,
      action: entry.action,
      module: MODULE,
      entityType: "User",
      entityId: entry.entityId,
      before: entry.before ?? undefined,
      after: entry.after ?? undefined,
      result: "SUCCESS",
      message: entry.message,
    },
  });
}

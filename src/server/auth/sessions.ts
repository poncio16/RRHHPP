import "server-only";
import { effectivePermissions } from "../authz/roles";
import type { ActorContext, RequestMeta } from "../context";
import { db } from "../db";
import { getSetting } from "../settings";
import { generateSessionToken, hashSessionToken } from "./tokens";

/** No se actualiza last_seen_at en cada petición: alcanza con una vez por minuto. */
const TOUCH_INTERVAL_MS = 60_000;

export async function createSession(userId: string, meta: RequestMeta, now = new Date()) {
  const { sessionAbsoluteHours } = await getSetting("security");
  const token = generateSessionToken();
  const expiresAt = new Date(now.getTime() + sessionAbsoluteHours * 3_600_000);
  const session = await db.session.create({
    data: {
      tokenHash: hashSessionToken(token),
      userId,
      createdAt: now,
      lastSeenAt: now,
      expiresAt,
      ip: meta.ip,
      userAgent: meta.userAgent?.slice(0, 500) ?? null,
    },
  });
  return { token, sessionId: session.id, expiresAt };
}

/**
 * Valida el token y devuelve el contexto del usuario, o null si la sesión no
 * existe, fue revocada, venció (absoluta o por inactividad) o el usuario está inactivo.
 */
export async function validateSession(
  token: string,
  meta: RequestMeta,
  now = new Date(),
): Promise<ActorContext | null> {
  const session = await db.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: { include: { role: { include: { permissions: true } } } } },
  });
  if (!session || session.revokedAt || session.expiresAt <= now || !session.user.isActive) return null;

  const { sessionIdleMinutes } = await getSetting("security");
  if (now.getTime() - session.lastSeenAt.getTime() > sessionIdleMinutes * 60_000) {
    await db.session.update({ where: { id: session.id }, data: { revokedAt: now } });
    return null;
  }

  if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: now } });
  }

  const { user } = session;
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    roleCode: user.role.code,
    roleName: user.role.name,
    permissions: effectivePermissions(
      user.role.code,
      user.role.permissions.map((p) => p.permission),
    ),
    mustChangePassword: user.mustChangePassword,
    sessionId: session.id,
    ip: meta.ip,
    userAgent: meta.userAgent,
  };
}

/** Revoca una sesión. Con `userId`, solo si pertenece a ese usuario. */
export async function revokeSession(sessionId: string, userId?: string, now = new Date()): Promise<void> {
  await db.session.updateMany({
    where: { id: sessionId, revokedAt: null, ...(userId ? { userId } : {}) },
    data: { revokedAt: now },
  });
}

/** Revoca todas las sesiones del usuario, salvo la indicada (la actual, al cambiar la contraseña). */
export async function revokeUserSessions(userId: string, exceptSessionId?: string, now = new Date()) {
  const { count } = await db.session.updateMany({
    where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    data: { revokedAt: now },
  });
  return count;
}

import { randomUUID } from "node:crypto";
import { hashPassword } from "@/server/auth/password";
import { createSession, validateSession } from "@/server/auth/sessions";
import { ADMIN_ROLE, DEFAULT_ROLES } from "@/server/authz/roles";
import type { ActorContext, RequestMeta } from "@/server/context";
import { db } from "@/server/db";

export const META: RequestMeta = { ip: "203.0.113.10", userAgent: "vitest" };

/** Crea los roles iniciales si no existen (igual que el seed). */
export async function ensureRoles() {
  for (const role of DEFAULT_ROLES) {
    await db.role.upsert({
      where: { code: role.code },
      update: {},
      create: {
        code: role.code,
        name: role.name,
        isSystem: true,
        permissions:
          role.code === ADMIN_ROLE ? undefined : { create: role.permissions.map((permission) => ({ permission })) },
      },
    });
  }
}

export const uniqueEmail = (prefix = "user") => `${prefix}-${randomUUID().slice(0, 8)}@test.local`;

export async function createTestUser(
  roleCode: string,
  {
    password = "ClaveSegura123",
    mustChangePassword = false,
    isActive = true,
    email = uniqueEmail(roleCode.toLowerCase()),
  } = {},
) {
  await ensureRoles();
  const role = await db.role.findUniqueOrThrow({ where: { code: roleCode } });
  return db.user.create({
    data: {
      email,
      name: `Usuario ${roleCode}`,
      passwordHash: await hashPassword(password),
      roleId: role.id,
      mustChangePassword,
      isActive,
    },
  });
}

/** Contexto real: crea una sesión y la valida como lo haría una petición. */
export async function actorFor(userId: string): Promise<ActorContext> {
  const { token } = await createSession(userId, META);
  const ctx = await validateSession(token, META);
  if (!ctx) throw new Error("No se pudo crear la sesión de prueba");
  return ctx;
}

export function lastAudit(where: { entityId?: string; userId?: string; userEmail?: string } = {}) {
  return db.auditLog.findFirst({ where, orderBy: { occurredAt: "desc" } });
}

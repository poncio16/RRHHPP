import { hash } from "@node-rs/argon2";
import type { PrismaClient } from "../../src/generated/prisma/client";
import { ARGON2_OPTIONS } from "../../src/server/auth/argon2-options";
import { ADMIN_ROLE, DEFAULT_ROLES } from "../../src/server/authz/roles";
import { defaultSetting } from "../../src/server/settings/definitions";

/** Credenciales del administrador inicial (solo se usan si todavía no hay ninguno). */
export type InitialAdmin = { email?: string; password?: string };

export function initialAdminFromEnv(env: NodeJS.ProcessEnv = process.env): InitialAdmin {
  return { email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD };
}

/**
 * Roles iniciales, parámetros de seguridad y administrador inicial (datos base).
 * Solo crea lo que falta: no pisa permisos ni parámetros editados desde la aplicación.
 */
export async function seedSecurity(db: PrismaClient, admin: InitialAdmin = initialAdminFromEnv()) {
  let roles = 0;
  for (const role of DEFAULT_ROLES) {
    const existing = await db.role.findUnique({ where: { code: role.code } });
    if (existing) continue;
    await db.role.create({
      data: {
        code: role.code,
        name: role.name,
        description: role.description,
        isSystem: true,
        // Los permisos del Administrador no se guardan: los tiene todos por código.
        permissions:
          role.code === ADMIN_ROLE ? undefined : { create: role.permissions.map((permission) => ({ permission })) },
      },
    });
    roles++;
  }

  const { count: securitySetting } = await db.setting.createMany({
    data: [
      {
        key: "security",
        value: defaultSetting("security"),
        description: "Sesiones, bloqueo por intentos fallidos y política de contraseñas.",
      },
    ],
    skipDuplicates: true,
  });

  const adminCount = await db.user.count({ where: { role: { code: ADMIN_ROLE } } });
  if (adminCount > 0) return { roles, securitySetting, adminCreated: false as const };

  const email = admin.email?.trim().toLowerCase();
  const password = admin.password;
  if (!email || !password) {
    throw new Error("Para crear el administrador inicial definí SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD en .env.");
  }
  const adminRole = await db.role.findUniqueOrThrow({ where: { code: ADMIN_ROLE } });
  await db.user.create({
    data: {
      email,
      name: "Administrador",
      passwordHash: await hash(password, ARGON2_OPTIONS),
      roleId: adminRole.id,
      mustChangePassword: true,
    },
  });
  return { roles, securitySetting, adminCreated: true as const, email };
}

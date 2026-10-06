import { hash } from "@node-rs/argon2";
import type { PrismaClient } from "../../src/generated/prisma/client";
import { ARGON2_OPTIONS } from "../../src/server/auth/argon2-options";
import { ADMIN_ROLE, DEFAULT_ROLES } from "../../src/server/authz/roles";
import { defaultSetting } from "../../src/server/settings/definitions";

/**
 * Roles iniciales, parámetros de seguridad y administrador inicial.
 * Solo crea lo que falta: no pisa permisos ni parámetros editados desde la aplicación.
 */
export async function seedSecurity(db: PrismaClient) {
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
  }

  await db.setting.upsert({
    where: { key: "security" },
    create: {
      key: "security",
      value: defaultSetting("security"),
      description: "Sesiones, bloqueo por intentos fallidos y política de contraseñas.",
    },
    update: {},
  });

  const adminCount = await db.user.count({ where: { role: { code: ADMIN_ROLE } } });
  if (adminCount > 0) return { adminCreated: false };

  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
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
  return { adminCreated: true, email };
}

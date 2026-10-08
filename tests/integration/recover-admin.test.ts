import { spawnSync } from "node:child_process";
import { verify } from "@node-rs/argon2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as auth from "@/features/auth/service";
import { createSession } from "@/server/auth/sessions";
import { db } from "@/server/db";
import { defaultSetting } from "@/server/settings/definitions";
import { AdminRecoveryError, recoverAdmin } from "../../prisma/tools/admin-recovery";
import { createTestUser, ensureRoles, META, uniqueEmail } from "./helpers";

const NEW_PASSWORD = "Recuperada2026";

beforeAll(async () => {
  await ensureRoles();
});

afterAll(async () => {
  await db.$disconnect();
});

const auditsOf = (entityId: string) =>
  db.auditLog.findMany({ where: { entityId, module: "usuarios" }, orderBy: { occurredAt: "asc" } });

describe("recuperación del administrador desde la consola", () => {
  it("restablece un usuario existente: clave nueva, rol administrador, desbloqueo y sesiones cerradas", async () => {
    const user = await createTestUser("RRHH", { isActive: false, mustChangePassword: false });
    await db.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 7, lockedUntil: new Date(Date.now() + 3_600_000) },
    });
    await createSession(user.id, META);
    await createSession(user.id, META);
    const old = await createSession(user.id, META);
    const oldRevokedAt = new Date("2026-01-01T12:00:00Z");
    await db.session.update({ where: { id: old.sessionId }, data: { revokedAt: oldRevokedAt } });

    const now = new Date();
    const result = await recoverAdmin(db, { email: `  ${user.email.toUpperCase()} `, password: NEW_PASSWORD, now });

    expect(result).toEqual({ action: "UPDATE", userId: user.id, email: user.email, revokedSessions: 2 });
    const updated = await db.user.findUniqueOrThrow({ where: { id: user.id }, include: { role: true } });
    expect(updated).toMatchObject({
      name: user.name,
      isActive: true,
      mustChangePassword: true,
      failedLoginCount: 0,
      lockedUntil: null,
      role: { code: "ADMIN" },
    });
    expect(await verify(updated.passwordHash, NEW_PASSWORD)).toBe(true);

    const sessions = await db.session.findMany({ where: { userId: user.id } });
    expect(sessions.filter((s) => s.revokedAt === null)).toHaveLength(0);
    expect(sessions.filter((s) => s.revokedAt?.getTime() === now.getTime())).toHaveLength(2);
    expect(sessions.find((s) => s.id === old.sessionId)?.revokedAt).toEqual(oldRevokedAt);

    const audits = await auditsOf(user.id);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      userId: null,
      userEmail: null,
      action: "UPDATE",
      module: "usuarios",
      entityType: "User",
      entityId: user.id,
      result: "SUCCESS",
      before: { isActive: false, role: "RRHH", failedLoginCount: 7, mustChangePassword: false },
      after: {
        isActive: true,
        role: "Administrador",
        failedLoginCount: 0,
        mustChangePassword: true,
        lockedUntil: null,
      },
    });
    expect(audits[0]!.message).toContain("Recuperación de acceso desde la consola del servidor");
    const stored = JSON.stringify(audits[0]);
    expect(stored).not.toContain(updated.passwordHash);
    expect(stored).not.toContain(user.passwordHash);
    expect(stored).not.toContain(NEW_PASSWORD);
    expect(stored).not.toContain("passwordHash");

    // Puede ingresar con la clave nueva y se le pide cambiarla.
    const login = await auth.login({ email: user.email, password: NEW_PASSWORD }, META);
    expect(login.mustChangePassword).toBe(true);
  }, 30_000);

  it("crea el administrador si el email no existe", async () => {
    const email = uniqueEmail("recuperado");

    const result = await recoverAdmin(db, { email, password: NEW_PASSWORD });

    expect(result).toMatchObject({ action: "CREATE", email, revokedSessions: 0 });
    const created = await db.user.findUniqueOrThrow({ where: { email }, include: { role: true } });
    expect(created).toMatchObject({
      id: result.userId,
      name: "Administrador",
      isActive: true,
      mustChangePassword: true,
      role: { code: "ADMIN" },
    });
    expect(await verify(created.passwordHash, NEW_PASSWORD)).toBe(true);

    const audits = await auditsOf(created.id);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      userId: null,
      userEmail: null,
      action: "CREATE",
      module: "usuarios",
      entityType: "User",
      result: "SUCCESS",
      after: { email, name: "Administrador", isActive: true, role: "Administrador" },
    });
    const stored = JSON.stringify(audits[0]);
    expect(stored).not.toContain(created.passwordHash);
    expect(stored).not.toContain(NEW_PASSWORD);
  }, 30_000);

  it("rechaza una contraseña que no cumple la política, sin tocar nada", async () => {
    const user = await createTestUser("ADMIN", { password: "ClaveSegura123" });
    const missing = uniqueEmail("no-existe");

    for (const [password, message] of [
      ["corta1", /al menos \d+ caracteres/],
      ["soloLetrasSinNumeros", /combinar letras y números/],
      ["12345678901234", /combinar letras y números/],
    ] as const) {
      await expect(recoverAdmin(db, { email: user.email, password })).rejects.toThrow(message);
      await expect(recoverAdmin(db, { email: missing, password })).rejects.toBeInstanceOf(AdminRecoveryError);
    }
    await expect(recoverAdmin(db, { email: "no-es-un-email", password: NEW_PASSWORD })).rejects.toBeInstanceOf(
      AdminRecoveryError,
    );

    const after = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.passwordHash).toBe(user.passwordHash);
    expect(await db.user.findUnique({ where: { email: missing } })).toBeNull();
    expect(await auditsOf(user.id)).toHaveLength(0);
  }, 30_000);

  it("usa el largo mínimo configurado en Seguridad", async () => {
    const user = await createTestUser("ADMIN");
    const previous = await db.setting.findUnique({ where: { key: "security" } });
    await db.setting.upsert({
      where: { key: "security" },
      create: { key: "security", value: { ...defaultSetting("security"), passwordMinLength: 16 } },
      update: { value: { ...defaultSetting("security"), passwordMinLength: 16 } },
    });
    try {
      await expect(recoverAdmin(db, { email: user.email, password: "Clave12345678" })).rejects.toThrow(
        /al menos 16 caracteres/,
      );
      await expect(recoverAdmin(db, { email: user.email, password: "ClaveDe16Letras1" })).resolves.toMatchObject({
        action: "UPDATE",
      });
    } finally {
      if (previous) {
        await db.setting.update({ where: { key: "security" }, data: { value: previous.value ?? {} } });
      } else {
        await db.setting.delete({ where: { key: "security" } });
      }
    }
  }, 30_000);

  it("el comando termina con código 1 si faltan variables o la clave es débil, y nunca muestra la clave", () => {
    const run = (email: string, password: string) =>
      spawnSync("npx", ["tsx", "prisma/tools/recover-admin.ts"], {
        encoding: "utf8",
        env: {
          ...process.env,
          DATABASE_URL: process.env.TEST_DATABASE_URL,
          ADMIN_EMAIL: email,
          ADMIN_PASSWORD: password,
        },
      });

    const missing = run("", "");
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain("ADMIN_EMAIL y ADMIN_PASSWORD");

    const weak = run(uniqueEmail("debil"), "sinNumerosNiNada");
    expect(weak.status).toBe(1);
    expect(weak.stderr).toContain("combinar letras y números");
    expect(weak.stdout + weak.stderr).not.toContain("sinNumerosNiNada");

    const email = uniqueEmail("consola");
    const ok = run(email, NEW_PASSWORD);
    expect(ok.status, ok.stderr).toBe(0);
    expect(ok.stdout).toContain(`Se creó el administrador ${email}`);
    expect(ok.stdout + ok.stderr).not.toContain(NEW_PASSWORD);
  }, 60_000);
});

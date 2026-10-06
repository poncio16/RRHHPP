import { afterAll, describe, expect, it } from "vitest";
import * as auth from "@/features/auth/service";
import { createSession, validateSession } from "@/server/auth/sessions";
import { db } from "@/server/db";
import { BusinessRuleError, ValidationError } from "@/server/errors";
import { actorFor, createTestUser, lastAudit, META, uniqueEmail } from "./helpers";

afterAll(async () => {
  await db.$disconnect();
});

describe("inicio de sesión", () => {
  it("con credenciales correctas crea una sesión válida y lo audita", async () => {
    const user = await createTestUser("RRHH");
    const result = await auth.login({ email: user.email.toUpperCase(), password: "ClaveSegura123" }, META);

    const ctx = await validateSession(result.token, META);
    expect(ctx?.userId).toBe(user.id);
    expect(ctx?.permissions.has("employee:write")).toBe(true);
    expect(ctx?.permissions.has("user:manage")).toBe(false);

    const audit = await lastAudit({ userId: user.id });
    expect(audit).toMatchObject({ action: "LOGIN", result: "SUCCESS", ip: META.ip });
  });

  it("guarda solo el hash del token, nunca el token", async () => {
    const user = await createTestUser("CONSULTA");
    const { token } = await auth.login({ email: user.email, password: "ClaveSegura123" }, META);
    expect(await db.session.count({ where: { tokenHash: token } })).toBe(0);
  });

  it("responde lo mismo para email inexistente y contraseña incorrecta", async () => {
    const user = await createTestUser("CONSULTA");
    const wrongPassword = await auth.login({ email: user.email, password: "otra" }, META).catch((e: unknown) => e);
    const unknownEmail = await auth.login({ email: uniqueEmail(), password: "otra" }, META).catch((e: unknown) => e);

    expect(wrongPassword).toBeInstanceOf(ValidationError);
    expect(unknownEmail).toBeInstanceOf(ValidationError);
    expect((wrongPassword as Error).message).toBe((unknownEmail as Error).message);
  });

  it("bloquea la cuenta después de 5 intentos fallidos (parámetro por defecto)", async () => {
    const user = await createTestUser("RRHH");
    for (let i = 0; i < 5; i++) {
      await expect(auth.login({ email: user.email, password: "mal" }, META)).rejects.toBeInstanceOf(ValidationError);
    }
    // Ni con la contraseña correcta entra mientras dure el bloqueo.
    await expect(auth.login({ email: user.email, password: "ClaveSegura123" }, META)).rejects.toBeInstanceOf(
      BusinessRuleError,
    );
    const failures = await db.auditLog.count({ where: { userId: user.id, action: "LOGIN_FAILED" } });
    expect(failures).toBe(6);
  });

  it("libera el bloqueo cuando vence", async () => {
    const user = await createTestUser("RRHH");
    await db.user.update({ where: { id: user.id }, data: { lockedUntil: new Date(Date.now() - 1000) } });
    await expect(auth.login({ email: user.email, password: "ClaveSegura123" }, META)).resolves.toBeDefined();
  });

  it("rechaza a un usuario inactivo aunque la contraseña sea correcta", async () => {
    const user = await createTestUser("RRHH", { isActive: false });
    await expect(auth.login({ email: user.email, password: "ClaveSegura123" }, META)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

describe("sesiones", () => {
  it("vence por inactividad (30 minutos por defecto)", async () => {
    const user = await createTestUser("RRHH");
    const start = new Date("2026-10-06T12:00:00Z");
    const { token } = await createSession(user.id, META, start);

    expect(await validateSession(token, META, new Date("2026-10-06T12:29:00Z"))).not.toBeNull();
    // Cada validación extiende la ventana: 29 min después del último uso sigue viva.
    expect(await validateSession(token, META, new Date("2026-10-06T12:58:00Z"))).not.toBeNull();
    expect(await validateSession(token, META, new Date("2026-10-06T13:29:00Z"))).toBeNull();
  });

  it("vence a las 10 horas aunque se use", async () => {
    const user = await createTestUser("RRHH");
    const start = new Date("2026-10-06T08:00:00Z");
    const { token } = await createSession(user.id, META, start);
    let now = start.getTime();
    while (now < start.getTime() + 10 * 3_600_000 - 20 * 60_000) {
      now += 20 * 60_000;
      expect(await validateSession(token, META, new Date(now))).not.toBeNull();
    }
    expect(await validateSession(token, META, new Date(start.getTime() + 10 * 3_600_000 + 1))).toBeNull();
  });

  it("se invalida al desactivar el usuario y al cerrar sesión", async () => {
    const user = await createTestUser("RRHH");
    const { token } = await createSession(user.id, META);
    const ctx = await validateSession(token, META);
    await auth.logout(ctx!);
    expect(await validateSession(token, META)).toBeNull();

    const second = await createSession(user.id, META);
    await db.user.update({ where: { id: user.id }, data: { isActive: false } });
    expect(await validateSession(second.token, META)).toBeNull();
  });
});

describe("cambio de contraseña", () => {
  it("exige la contraseña actual, valida la política y cierra las otras sesiones", async () => {
    const user = await createTestUser("RRHH", { mustChangePassword: true });
    const ctx = await actorFor(user.id);
    const other = await createSession(user.id, META);

    await expect(
      auth.changeOwnPassword(ctx, {
        currentPassword: "mal",
        newPassword: "NuevaClave2026",
        confirmPassword: "NuevaClave2026",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      auth.changeOwnPassword(ctx, {
        currentPassword: "ClaveSegura123",
        newPassword: "corta1",
        confirmPassword: "corta1",
      }),
    ).rejects.toThrow();
    await expect(
      auth.changeOwnPassword(ctx, {
        currentPassword: "ClaveSegura123",
        newPassword: "sololetrasssss",
        confirmPassword: "sololetrasssss",
      }),
    ).rejects.toThrow();

    await auth.changeOwnPassword(ctx, {
      currentPassword: "ClaveSegura123",
      newPassword: "NuevaClave2026",
      confirmPassword: "NuevaClave2026",
    });

    const updated = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.mustChangePassword).toBe(false);
    expect(await validateSession(other.token, META)).toBeNull();
    expect(await validateSession((await createSession(user.id, META)).token, META)).not.toBeNull();
    await expect(auth.login({ email: user.email, password: "NuevaClave2026" }, META)).resolves.toBeDefined();
  });
});

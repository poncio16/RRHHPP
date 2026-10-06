import { afterAll, describe, expect, it } from "vitest";
import * as auth from "@/features/auth/service";
import * as roles from "@/features/roles/service";
import * as users from "@/features/users/service";
import { validateSession } from "@/server/auth/sessions";
import { db } from "@/server/db";
import { BusinessRuleError, ConflictError, ForbiddenError, toAppError } from "@/server/errors";
import { actorFor, createTestUser, lastAudit, META, uniqueEmail } from "./helpers";

afterAll(async () => {
  await db.$disconnect();
});

const roleId = async (code: string) => (await db.role.findUniqueOrThrow({ where: { code } })).id;

describe("autorización en el servidor", () => {
  it("rechaza la gestión de usuarios a quien no tiene permiso y lo audita", async () => {
    const user = await createTestUser("RRHH");
    const ctx = await actorFor(user.id);

    await expect(users.listUsers(ctx, {})).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      users.createUser(ctx, { name: "Intruso", email: uniqueEmail(), roleId: await roleId("ADMIN") }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const audit = await lastAudit({ userId: user.id });
    expect(audit).toMatchObject({ action: "ACCESS_DENIED", result: "DENIED" });
  });

  it("los permisos de cada rol inicial coinciden con la matriz aprobada", async () => {
    const consulta = await actorFor((await createTestUser("CONSULTA")).id);
    const administracion = await actorFor((await createTestUser("ADMINISTRACION")).id);
    const admin = await actorFor((await createTestUser("ADMIN")).id);

    expect(consulta.permissions.has("employee:read")).toBe(true);
    expect(consulta.permissions.has("employee.personal:read")).toBe(false);
    expect(consulta.permissions.has("salary:read")).toBe(false);
    expect(administracion.permissions.has("salary:read")).toBe(true);
    expect(administracion.permissions.has("salary:write")).toBe(false);
    expect(administracion.permissions.has("document.sensitive:read")).toBe(false);
    expect(admin.permissions.has("audit:read")).toBe(true);
    expect(admin.permissions.has("record:hard-delete")).toBe(true);
  });
});

describe("gestión de usuarios", () => {
  it("crea un usuario con contraseña temporal que obliga a cambiarla", async () => {
    const admin = await actorFor((await createTestUser("ADMIN")).id);
    const email = uniqueEmail("nuevo");
    const { id, temporaryPassword } = await users.createUser(admin, {
      name: "María Pérez",
      email: email.toUpperCase(),
      roleId: await roleId("RRHH"),
    });

    const created = await db.user.findUniqueOrThrow({ where: { id } });
    expect(created.email).toBe(email);
    expect(created.mustChangePassword).toBe(true);
    expect(created.passwordHash).not.toContain(temporaryPassword);

    const login = await auth.login({ email, password: temporaryPassword }, META);
    expect(login.mustChangePassword).toBe(true);

    const audit = await lastAudit({ entityId: id });
    expect(audit?.action).toBe("CREATE");
    expect(JSON.stringify(audit?.after)).not.toContain("passwordHash");
  });

  it("no permite emails duplicados y lo informa en el campo email", async () => {
    const admin = await actorFor((await createTestUser("ADMIN")).id);
    const existing = await createTestUser("CONSULTA");
    const error = await users
      .createUser(admin, { name: "Duplicado", email: existing.email, roleId: await roleId("CONSULTA") })
      .catch((e: unknown) => e);
    const appError = toAppError(error);
    expect(appError).toBeInstanceOf(ConflictError);
    expect((appError as ConflictError).fieldErrors).toEqual({ email: ["Ya existe un registro con ese email."] });
  });

  it("registra el cambio de rol como cambio de permisos, con valores anterior y nuevo", async () => {
    const admin = await actorFor((await createTestUser("ADMIN")).id);
    const target = await createTestUser("CONSULTA");
    await users.updateUser(admin, target.id, {
      name: target.name,
      email: target.email,
      roleId: await roleId("RRHH"),
      isActive: true,
    });

    const audit = await lastAudit({ entityId: target.id });
    expect(audit?.action).toBe("PERMISSION_CHANGE");
    expect(audit?.before).toMatchObject({ role: "Consulta" });
    expect(audit?.after).toMatchObject({ role: "RRHH" });
  });

  it("al desactivar un usuario cierra sus sesiones", async () => {
    const admin = await actorFor((await createTestUser("ADMIN")).id);
    const target = await createTestUser("RRHH");
    const { token } = await auth.login({ email: target.email, password: "ClaveSegura123" }, META);

    await users.updateUser(admin, target.id, {
      name: target.name,
      email: target.email,
      roleId: target.roleId,
      isActive: false,
    });
    expect(await validateSession(token, META)).toBeNull();
  });

  it("impide desactivarse o cambiarse el rol a uno mismo", async () => {
    const adminUser = await createTestUser("ADMIN");
    const admin = await actorFor(adminUser.id);
    const base = { name: adminUser.name, email: adminUser.email, roleId: adminUser.roleId, isActive: true };

    await expect(users.updateUser(admin, adminUser.id, { ...base, isActive: false })).rejects.toBeInstanceOf(
      BusinessRuleError,
    );
    await expect(
      users.updateUser(admin, adminUser.id, { ...base, roleId: await roleId("CONSULTA") }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("no deja el sistema sin administradores activos", async () => {
    // Se desactivan todos los administradores salvo uno, que es el que se intenta quitar.
    const remaining = await createTestUser("ADMIN");
    await db.user.updateMany({
      where: { role: { code: "ADMIN" }, id: { not: remaining.id } },
      data: { isActive: false },
    });
    const rrhhManager = await createTestUser("RRHH");
    // Un actor con user:manage que no sea admin: se le otorga el permiso al vuelo.
    const actor = { ...(await actorFor(rrhhManager.id)), permissions: new Set(["user:manage"] as const) };

    await expect(
      users.updateUser(actor, remaining.id, {
        name: remaining.name,
        email: remaining.email,
        roleId: await roleId("RRHH"),
        isActive: true,
      }),
    ).rejects.toThrow("al menos un administrador activo");
  });

  it("restablecer la contraseña desbloquea la cuenta y cierra sus sesiones", async () => {
    const admin = await actorFor((await createTestUser("ADMIN")).id);
    const target = await createTestUser("RRHH");
    const { token } = await auth.login({ email: target.email, password: "ClaveSegura123" }, META);
    await db.user.update({ where: { id: target.id }, data: { lockedUntil: new Date(Date.now() + 3_600_000) } });

    const { temporaryPassword } = await users.resetPassword(admin, target.id);
    expect(await validateSession(token, META)).toBeNull();
    const login = await auth.login({ email: target.email, password: temporaryPassword }, META);
    expect(login.mustChangePassword).toBe(true);
  });
});

describe("roles y permisos", () => {
  it("cambia los permisos de un rol, se aplica a sus usuarios y queda auditado", async () => {
    const admin = await actorFor((await createTestUser("ADMIN")).id);
    const consultaRoleId = await roleId("CONSULTA");
    const before = await db.rolePermission.findMany({ where: { roleId: consultaRoleId } });

    await roles.updateRolePermissions(admin, {
      roleId: consultaRoleId,
      permissions: [...before.map((p) => p.permission), "report:seniority"],
    });

    const consulta = await actorFor((await createTestUser("CONSULTA")).id);
    expect(consulta.permissions.has("report:seniority")).toBe(true);

    const audit = await lastAudit({ entityId: consultaRoleId });
    expect(audit?.action).toBe("PERMISSION_CHANGE");
    expect((audit?.after as { permissions: string[] }).permissions).toContain("report:seniority");

    // Se restaura para no afectar otros tests.
    await roles.updateRolePermissions(admin, { roleId: consultaRoleId, permissions: before.map((p) => p.permission) });
  });

  it("no permite editar el rol Administrador ni asignar permisos inexistentes", async () => {
    const admin = await actorFor((await createTestUser("ADMIN")).id);
    await expect(
      roles.updateRolePermissions(admin, { roleId: await roleId("ADMIN"), permissions: [] }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(
      roles.updateRolePermissions(admin, { roleId: await roleId("CONSULTA"), permissions: ["inventado:todo"] }),
    ).rejects.toThrow();
  });
});

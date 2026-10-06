import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, isPermission } from "@/server/authz/permissions";
import { ADMIN_ROLE, DEFAULT_ROLES, effectivePermissions } from "@/server/authz/roles";

describe("effectivePermissions", () => {
  it("el Administrador tiene siempre todos los permisos, aunque no estén guardados", () => {
    expect(effectivePermissions(ADMIN_ROLE, []).size).toBe(ALL_PERMISSIONS.length);
  });

  it("los demás roles solo tienen los permisos guardados y válidos", () => {
    const perms = effectivePermissions("CONSULTA", ["employee:read", "permiso:inexistente"]);
    expect([...perms]).toEqual(["employee:read"]);
  });
});

describe("DEFAULT_ROLES", () => {
  it("solo usan permisos del catálogo", () => {
    for (const role of DEFAULT_ROLES) for (const p of role.permissions) expect(isPermission(p)).toBe(true);
  });

  it("solo el Administrador gestiona usuarios y ve la auditoría", () => {
    for (const role of DEFAULT_ROLES.filter((r) => r.code !== ADMIN_ROLE)) {
      expect(role.permissions).not.toContain("user:manage");
      expect(role.permissions).not.toContain("audit:read");
    }
  });
});

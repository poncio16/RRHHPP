import { ALL_PERMISSIONS, type Permission } from "./permissions";

/** Código del rol con acceso total. Sus permisos no se guardan: son siempre todos. */
export const ADMIN_ROLE = "ADMIN";

type RoleDefinition = { code: string; name: string; description: string; permissions: readonly Permission[] };

/**
 * Roles iniciales (docs/arquitectura.md, sección 4.5). El seed los crea si no
 * existen; después el administrador puede ajustar sus permisos.
 */
export const DEFAULT_ROLES: readonly RoleDefinition[] = [
  {
    code: ADMIN_ROLE,
    name: "Administrador",
    description: "Acceso total, incluida la administración de usuarios y la auditoría.",
    permissions: ALL_PERMISSIONS,
  },
  {
    code: "RRHH",
    name: "RRHH",
    description: "Gestión completa de la información de personal.",
    permissions: ALL_PERMISSIONS.filter(
      (p) => !["config:manage", "user:manage", "audit:read", "record:hard-delete"].includes(p),
    ),
  },
  {
    code: "ADMINISTRACION",
    name: "Administración",
    description: "Lectura de información administrativa y reportes autorizados.",
    permissions: [
      "employee:read",
      "employee.personal:read",
      "employee.bank:read",
      "salary:read",
      "novelty:read",
      "novelty:report",
      "document:read",
      "leave:read",
      "attendance:read",
      "exit:read",
      "report:headcount",
      "report:movements",
      "report:absenteeism",
      "report:vacations",
      "report:salary",
      "export:run",
    ],
  },
  {
    code: "CONSULTA",
    name: "Consulta",
    description: "Solo lectura de la información básica permitida.",
    permissions: ["employee:read", "leave:read", "attendance:read", "report:headcount"],
  },
];

/** Permisos efectivos de un rol: el Administrador siempre tiene todos. */
export function effectivePermissions(roleCode: string, stored: readonly string[]): Set<Permission> {
  if (roleCode === ADMIN_ROLE) return new Set(ALL_PERMISSIONS);
  return new Set(ALL_PERMISSIONS.filter((p) => stored.includes(p)));
}

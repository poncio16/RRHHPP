/**
 * Catálogo de permisos: capacidades del software. Los roles (en base) agrupan
 * estos códigos y el administrador los edita desde Usuarios y permisos.
 * Agregar un permiso nuevo acá lo hace disponible para asignar; el rol
 * Administrador los tiene todos siempre.
 */

export const PERMISSION_GROUPS = [
  {
    label: "Empleados",
    permissions: [
      { code: "employee:read", label: "Ver legajos (datos generales)" },
      { code: "employee:write", label: "Crear y modificar legajos" },
      { code: "employee.personal:read", label: "Ver datos personales (DNI, CUIL, domicilio, nacimiento)" },
      { code: "employee.bank:read", label: "Ver datos bancarios" },
    ],
  },
  {
    label: "Remuneraciones y novedades",
    permissions: [
      { code: "salary:read", label: "Ver información salarial" },
      { code: "salary:write", label: "Registrar información salarial" },
      { code: "novelty:read", label: "Ver novedades" },
      { code: "novelty:write", label: "Registrar novedades" },
      { code: "novelty:report", label: "Marcar novedades como informadas" },
    ],
  },
  {
    label: "Documentación",
    permissions: [
      { code: "document:read", label: "Ver documentación" },
      { code: "document:write", label: "Registrar documentación" },
      {
        code: "document.sensitive:read",
        label: "Ver datos de salud (documentación médica y preocupacional, licencias por enfermedad o accidente)",
      },
    ],
  },
  {
    label: "Tiempo",
    permissions: [
      { code: "leave:read", label: "Ver licencias, ausencias y vacaciones" },
      { code: "leave:write", label: "Registrar licencias, ausencias y vacaciones" },
      { code: "leave:approve", label: "Aprobar o rechazar solicitudes" },
      { code: "attendance:read", label: "Ver asistencia y horarios" },
      { code: "attendance:write", label: "Registrar asistencia" },
    ],
  },
  {
    label: "Egresos",
    permissions: [
      { code: "exit:read", label: "Ver egresos" },
      { code: "exit:write", label: "Registrar egresos y reingresos" },
    ],
  },
  {
    label: "Reportes",
    permissions: [
      { code: "report:headcount", label: "Reporte de dotación" },
      { code: "report:movements", label: "Reporte de altas y bajas" },
      { code: "report:absenteeism", label: "Reporte de ausentismo" },
      { code: "report:vacations", label: "Reporte de vacaciones" },
      { code: "report:expirations", label: "Reporte de vencimientos" },
      { code: "report:seniority", label: "Reporte de antigüedad" },
      { code: "report:salary", label: "Reporte de remuneraciones informadas" },
    ],
  },
  {
    label: "Importación y exportación",
    permissions: [
      { code: "import:run", label: "Importar empleados" },
      { code: "export:run", label: "Exportar listados y reportes" },
    ],
  },
  {
    label: "Administración",
    permissions: [
      { code: "config:catalogs", label: "Administrar catálogos de RRHH" },
      { code: "config:manage", label: "Administrar empresa y parámetros generales" },
      { code: "user:manage", label: "Administrar usuarios, roles y permisos" },
      { code: "audit:read", label: "Ver auditoría" },
      { code: "record:hard-delete", label: "Eliminar registros físicamente" },
    ],
  },
] as const;

export type Permission = (typeof PERMISSION_GROUPS)[number]["permissions"][number]["code"];

export const ALL_PERMISSIONS: readonly Permission[] = PERMISSION_GROUPS.flatMap((g) =>
  g.permissions.map((p) => p.code),
);

const PERMISSION_SET = new Set<string>(ALL_PERMISSIONS);

export function isPermission(value: string): value is Permission {
  return PERMISSION_SET.has(value);
}

export const PERMISSION_LABELS: Record<Permission, string> = Object.fromEntries(
  PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => [p.code, p.label])),
) as Record<Permission, string>;

import type { AuditAction, AuditResult } from "@/generated/prisma/enums";

export const ACTION_LABELS: Record<AuditAction, string> = {
  CREATE: "Alta",
  UPDATE: "Modificación",
  SOFT_DELETE: "Baja lógica",
  DELETE: "Eliminación",
  LOGIN: "Inicio de sesión",
  LOGIN_FAILED: "Inicio de sesión fallido",
  LOGOUT: "Cierre de sesión",
  PERMISSION_CHANGE: "Cambio de permisos",
  EXPORT: "Exportación",
  IMPORT: "Importación",
  FILE_DOWNLOAD: "Descarga de archivo",
  ACCESS_DENIED: "Acceso denegado",
};

export const RESULT_LABELS: Record<AuditResult, { label: string; variant: "success" | "warning" | "destructive" }> = {
  SUCCESS: { label: "Correcto", variant: "success" },
  FAILURE: { label: "Fallido", variant: "warning" },
  DENIED: { label: "Denegado", variant: "destructive" },
};

/** Nombre visible de cada módulo que registra auditoría; uno desconocido se muestra tal cual. */
export const MODULE_LABELS: Record<string, string> = {
  alertas: "Alertas",
  asistencia: "Asistencia",
  autenticacion: "Inicio de sesión",
  configuracion: "Configuración",
  documentacion: "Documentación",
  egresos: "Egresos",
  empleados: "Empleados",
  importacion: "Importación",
  licencias: "Licencias y ausencias",
  navegacion: "Navegación",
  novedades: "Novedades",
  remuneraciones: "Información salarial",
  reportes: "Reportes",
  usuarios: "Usuarios y permisos",
  vacaciones: "Vacaciones",
  auditoria: "Auditoría",
};

export const moduleLabel = (module: string) => MODULE_LABELS[module] ?? module;

/** Nombres de los campos más comunes en los cambios; el resto se muestra con su nombre técnico. */
export const FIELD_LABELS: Record<string, string> = {
  fileNumber: "Legajo",
  lastName: "Apellido",
  firstName: "Nombre",
  name: "Nombre",
  dni: "DNI",
  cuil: "CUIL",
  birthDate: "Fecha de nacimiento",
  sex: "Sexo",
  nationalityId: "Nacionalidad",
  maritalStatusId: "Estado civil",
  addressLine: "Domicilio",
  city: "Localidad",
  provinceId: "Provincia",
  postalCode: "Código postal",
  phone: "Teléfono",
  email: "Email",
  emergencyContactName: "Contacto de emergencia",
  emergencyContactPhone: "Teléfono de emergencia",
  hireDate: "Fecha de ingreso",
  seniorityDate: "Antigüedad reconocida desde",
  contractEndDate: "Fin de contrato",
  exitDate: "Fecha de egreso",
  exitId: "Egreso",
  status: "Estado",
  departmentId: "Sector",
  positionId: "Puesto",
  categoryId: "Categoría",
  agreementId: "Convenio",
  contractTypeId: "Tipo de contratación",
  workdayTypeId: "Jornada",
  workScheduleId: "Horario",
  workModalityId: "Modalidad",
  workplaceId: "Establecimiento",
  supervisorId: "Superior",
  healthInsurerId: "Obra social",
  artProviderId: "ART",
  bankId: "Banco",
  cbu: "CBU",
  alias: "Alias",
  accountTypeId: "Tipo de cuenta",
  employeeId: "Empleado",
  effectiveDate: "Vigencia",
  startDate: "Desde",
  endDate: "Hasta",
  date: "Fecha",
  period: "Período",
  days: "Días",
  amount: "Importe",
  quantity: "Cantidad",
  notes: "Observaciones",
  reason: "Motivo",
  isActive: "Activo",
  checkIn: "Entrada",
  checkOut: "Salida",
  issueDate: "Emisión",
  expiryDate: "Vencimiento",
  fileName: "Archivo",
  basicSalary: "Básico",
  grossReported: "Bruto informado",
  deductionsReported: "Descuentos informados",
  netReported: "Neto informado",
  roleId: "Rol",
  permissions: "Permisos",
  filtros: "Filtros",
  filas: "Filas",
  formato: "Formato",
  recurso: "Recurso",
};

/** Pantalla del registro afectado, cuando existe una. */
export function entityHref(entityType: string | null, entityId: string | null): string | null {
  if (!entityType || !entityId) return null;
  if (entityType === "Employee") return `/empleados/${entityId}`;
  if (entityType === "User") return `/usuarios/${entityId}`;
  if (entityType === "ImportJob") return `/importar/${entityId}`;
  return null;
}

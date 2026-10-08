/*
 * Columnas de la plantilla de importación de empleados. Los catálogos se
 * escriben por nombre (sin distinguir mayúsculas ni acentos) y se buscan entre
 * los valores activos; el superior, por número de legajo.
 */

export type LookupKey =
  | "provincias"
  | "nacionalidades"
  | "estado-civil"
  | "sectores"
  | "puestos"
  | "categorias"
  | "convenios"
  | "tipos-contrato"
  | "jornadas"
  | "horarios"
  | "modalidades"
  | "establecimientos"
  | "obras-sociales"
  | "art";

export type ImportColumn = {
  /** Campo del esquema del legajo. */
  field: string;
  header: string;
  required: boolean;
  kind: "text" | "date" | "number" | "sex" | "supervisor" | { lookup: LookupKey };
  help: string;
};

export const IMPORT_COLUMNS: ImportColumn[] = [
  {
    field: "fileNumber",
    header: "Legajo",
    required: false,
    kind: "number",
    help: "Número de legajo. Vacío: el siguiente libre.",
  },
  { field: "lastName", header: "Apellido", required: true, kind: "text", help: "Hasta 100 caracteres." },
  { field: "firstName", header: "Nombre", required: true, kind: "text", help: "Hasta 100 caracteres." },
  { field: "dni", header: "DNI", required: true, kind: "text", help: "7 u 8 dígitos, con o sin puntos." },
  { field: "cuil", header: "CUIL", required: true, kind: "text", help: "11 dígitos, con o sin guiones." },
  { field: "birthDate", header: "Fecha de nacimiento", required: true, kind: "date", help: "dd/mm/aaaa." },
  { field: "sex", header: "Sexo", required: true, kind: "sex", help: "F, M o X." },
  {
    field: "nationalityId",
    header: "Nacionalidad",
    required: false,
    kind: { lookup: "nacionalidades" },
    help: "Como figura en Catálogos.",
  },
  {
    field: "maritalStatusId",
    header: "Estado civil",
    required: false,
    kind: { lookup: "estado-civil" },
    help: "Como figura en Catálogos.",
  },
  { field: "addressLine", header: "Domicilio", required: true, kind: "text", help: "Calle y número." },
  { field: "city", header: "Localidad", required: true, kind: "text", help: "" },
  {
    field: "provinceId",
    header: "Provincia",
    required: true,
    kind: { lookup: "provincias" },
    help: "Nombre de la provincia.",
  },
  { field: "postalCode", header: "Código postal", required: true, kind: "text", help: "Hasta 8 caracteres." },
  { field: "phone", header: "Teléfono", required: false, kind: "text", help: "" },
  { field: "email", header: "Email", required: false, kind: "text", help: "" },
  { field: "emergencyContactName", header: "Contacto de emergencia", required: false, kind: "text", help: "" },
  { field: "emergencyContactPhone", header: "Teléfono de emergencia", required: false, kind: "text", help: "" },
  { field: "hireDate", header: "Fecha de ingreso", required: true, kind: "date", help: "dd/mm/aaaa." },
  {
    field: "seniorityDate",
    header: "Antigüedad reconocida desde",
    required: false,
    kind: "date",
    help: "dd/mm/aaaa. Vacío: la de ingreso.",
  },
  {
    field: "contractEndDate",
    header: "Fin de contrato",
    required: false,
    kind: "date",
    help: "dd/mm/aaaa. Obligatorio si el tipo de contratación lo exige.",
  },
  {
    field: "departmentId",
    header: "Sector",
    required: true,
    kind: { lookup: "sectores" },
    help: "Como figura en Catálogos.",
  },
  {
    field: "positionId",
    header: "Puesto",
    required: true,
    kind: { lookup: "puestos" },
    help: "Como figura en Catálogos.",
  },
  {
    field: "categoryId",
    header: "Categoría",
    required: false,
    kind: { lookup: "categorias" },
    help: "Como figura en Catálogos.",
  },
  {
    field: "agreementId",
    header: "Convenio",
    required: false,
    kind: { lookup: "convenios" },
    help: "Obligatorio si la categoría pertenece a un convenio.",
  },
  {
    field: "contractTypeId",
    header: "Tipo de contratación",
    required: true,
    kind: { lookup: "tipos-contrato" },
    help: "Como figura en Catálogos.",
  },
  {
    field: "workdayTypeId",
    header: "Jornada",
    required: false,
    kind: { lookup: "jornadas" },
    help: "Como figura en Catálogos.",
  },
  {
    field: "workScheduleId",
    header: "Horario",
    required: false,
    kind: { lookup: "horarios" },
    help: "Nombre del horario.",
  },
  {
    field: "workModalityId",
    header: "Modalidad",
    required: false,
    kind: { lookup: "modalidades" },
    help: "Como figura en Catálogos.",
  },
  {
    field: "workplaceId",
    header: "Establecimiento",
    required: true,
    kind: { lookup: "establecimientos" },
    help: "Como figura en Catálogos.",
  },
  {
    field: "supervisorId",
    header: "Legajo del superior",
    required: false,
    kind: "supervisor",
    help: "Número de legajo de un empleado activo ya cargado.",
  },
  {
    field: "healthInsurerId",
    header: "Obra social",
    required: false,
    kind: { lookup: "obras-sociales" },
    help: "Como figura en Catálogos.",
  },
  {
    field: "artProviderId",
    header: "ART",
    required: false,
    kind: { lookup: "art" },
    help: "Como figura en Catálogos.",
  },
];

/** Tope de filas por archivo: una PyME no da de alta más de una vez. */
export const IMPORT_MAX_ROWS = 500;
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
/** Un .xlsx descomprimido no puede pasar de esto: la plantilla con 500 filas ocupa bastante menos. */
export const IMPORT_MAX_UNZIPPED_BYTES = 10 * 1024 * 1024;
/** Columnas que se leen por fila; la plantilla usa bastante menos. */
export const IMPORT_MAX_COLUMNS = 100;

/** Texto comparable: sin mayúsculas, acentos ni espacios repetidos. */
export function normalizeKey(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

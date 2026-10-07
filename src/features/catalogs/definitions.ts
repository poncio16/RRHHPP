/**
 * Catálogos administrables con el ABM genérico de Configuración. Cada
 * definición describe los campos del formulario y las columnas del listado;
 * el repositorio sabe a qué tabla corresponde cada uno.
 *
 * Este archivo se usa también en el cliente: no importar nada del servidor.
 */

/** Origen de las opciones de un campo de referencia. */
export type RefSource = { kind: "catalog"; key: CatalogKey } | { kind: "province" } | { kind: "lookup"; group: string };

export type CatalogField =
  | {
      name: string;
      label: string;
      type: "text";
      required?: boolean;
      max?: number;
      /** Expresión regular que debe cumplir el valor (ya normalizado). */
      pattern?: string;
      patternMessage?: string;
      uppercase?: boolean;
      /** Solo se carga en el alta; después no se puede cambiar (lo usa el sistema). */
      immutable?: boolean;
      hint?: string;
      inList?: boolean;
    }
  | {
      name: string;
      label: string;
      type: "hours";
      required: true;
      hint?: string;
      inList?: boolean;
    }
  | { name: string; label: string; type: "boolean"; hint?: string; inList?: boolean }
  | {
      name: string;
      label: string;
      type: "ref";
      source: RefSource;
      /** Relación de Prisma con la que se lee la etiqueta en el listado. */
      relation: string;
      required?: boolean;
      hint?: string;
      inList?: boolean;
    };

export type CatalogDefinition = {
  key: CatalogKey;
  /** Título en plural ("Sectores"). */
  title: string;
  /** Nombre de un elemento ("sector"), para botones y mensajes. */
  singular: string;
  description: string;
  section: CatalogSection;
  /** Grupo de LookupValue, si el catálogo es una lista simple. */
  lookupGroup?: string;
  fields: CatalogField[];
};

export const CATALOG_SECTIONS = {
  estructura: "Estructura de la empresa",
  contratacion: "Contratación",
  seguridadSocial: "Seguridad social y bancos",
  listas: "Listas",
} as const;
export type CatalogSection = keyof typeof CATALOG_SECTIONS;

const name = (max = 120): CatalogField => ({
  name: "name",
  label: "Nombre",
  type: "text",
  required: true,
  max,
  inList: true,
});

const lookup = (
  key: CatalogKey,
  title: string,
  singular: string,
  group: string,
  description: string,
): CatalogDefinition => ({
  key,
  title,
  singular,
  description,
  section: "listas",
  lookupGroup: group,
  fields: [
    { name: "label", label: "Nombre", type: "text", required: true, max: 120, inList: true },
    {
      name: "code",
      label: "Código interno",
      type: "text",
      required: true,
      max: 40,
      uppercase: true,
      pattern: "^[A-Z0-9_]+$",
      patternMessage: "Usá mayúsculas, números y guion bajo (por ejemplo, OTRO_MOTIVO).",
      immutable: true,
      hint: "Identificador fijo que usa el sistema. No se puede cambiar después del alta.",
      inList: true,
    },
  ],
});

export const CATALOG_KEYS = [
  "sectores",
  "puestos",
  "establecimientos",
  "convenios",
  "categorias",
  "tipos-contrato",
  "jornadas",
  "obras-sociales",
  "art",
  "bancos",
  "estado-civil",
  "nacionalidades",
  "modalidades",
  "tipos-cuenta",
  "tipos-egreso",
  "motivos-egreso",
] as const;
export type CatalogKey = (typeof CATALOG_KEYS)[number];

export const CATALOGS: Record<CatalogKey, CatalogDefinition> = {
  sectores: {
    key: "sectores",
    title: "Sectores",
    singular: "sector",
    description: "Áreas de la empresa a las que pertenece cada empleado.",
    section: "estructura",
    fields: [
      name(),
      {
        name: "code",
        label: "Código",
        type: "text",
        max: 20,
        uppercase: true,
        hint: "Opcional. Abreviatura para reportes (por ejemplo, ADM).",
        inList: true,
      },
    ],
  },
  puestos: {
    key: "puestos",
    title: "Puestos",
    singular: "puesto",
    description: "Puestos de trabajo. El sector es una sugerencia al cargar el legajo.",
    section: "estructura",
    fields: [
      name(),
      {
        name: "departmentId",
        label: "Sector sugerido",
        type: "ref",
        source: { kind: "catalog", key: "sectores" },
        relation: "department",
        inList: true,
      },
    ],
  },
  establecimientos: {
    key: "establecimientos",
    title: "Establecimientos",
    singular: "establecimiento",
    description: "Sucursales, plantas u oficinas donde trabaja el personal.",
    section: "estructura",
    fields: [
      name(),
      { name: "addressLine", label: "Domicilio", type: "text", max: 200 },
      { name: "city", label: "Localidad", type: "text", max: 120, inList: true },
      {
        name: "provinceId",
        label: "Provincia",
        type: "ref",
        source: { kind: "province" },
        relation: "province",
        inList: true,
      },
    ],
  },
  convenios: {
    key: "convenios",
    title: "Convenios colectivos",
    singular: "convenio",
    description: "Convenios colectivos de trabajo aplicables al personal.",
    section: "contratacion",
    fields: [
      name(200),
      { name: "number", label: "Número", type: "text", max: 40, hint: "Por ejemplo, 130/75.", inList: true },
      { name: "unionName", label: "Sindicato", type: "text", max: 200, inList: true },
    ],
  },
  categorias: {
    key: "categorias",
    title: "Categorías",
    singular: "categoría",
    description: "Categorías laborales, opcionalmente asociadas a un convenio.",
    section: "contratacion",
    fields: [
      name(),
      {
        name: "agreementId",
        label: "Convenio",
        type: "ref",
        source: { kind: "catalog", key: "convenios" },
        relation: "agreement",
        inList: true,
      },
    ],
  },
  "tipos-contrato": {
    key: "tipos-contrato",
    title: "Tipos de contrato",
    singular: "tipo de contrato",
    description: "Modalidades de contratación.",
    section: "contratacion",
    fields: [
      name(),
      {
        name: "hasEndDate",
        label: "Exige fecha de finalización",
        type: "boolean",
        hint: "Por ejemplo, contratos a plazo fijo o eventuales.",
        inList: true,
      },
    ],
  },
  jornadas: {
    key: "jornadas",
    title: "Tipos de jornada",
    singular: "tipo de jornada",
    description: "Jornada completa, parcial u otras, con su carga horaria semanal.",
    section: "contratacion",
    fields: [
      name(),
      {
        name: "weeklyHours",
        label: "Horas semanales",
        type: "hours",
        required: true,
        hint: "Hasta dos decimales.",
        inList: true,
      },
    ],
  },
  "obras-sociales": {
    key: "obras-sociales",
    title: "Obras sociales",
    singular: "obra social",
    description: "Obras sociales y prepagas del personal.",
    section: "seguridadSocial",
    fields: [
      name(200),
      {
        name: "rnosCode",
        label: "Código RNOS",
        type: "text",
        max: 10,
        pattern: "^\\d{6}$",
        patternMessage: "El código RNOS tiene 6 dígitos.",
        hint: "Opcional. Registro Nacional de Obras Sociales.",
        inList: true,
      },
    ],
  },
  art: {
    key: "art",
    title: "ART",
    singular: "ART",
    description: "Aseguradoras de riesgos del trabajo.",
    section: "seguridadSocial",
    fields: [name(200)],
  },
  bancos: {
    key: "bancos",
    title: "Bancos",
    singular: "banco",
    description: "Bancos para las cuentas sueldo. El código valida el CBU.",
    section: "seguridadSocial",
    fields: [
      name(200),
      {
        name: "code",
        label: "Código de entidad",
        type: "text",
        required: true,
        max: 3,
        pattern: "^\\d{3}$",
        patternMessage: "El código de entidad tiene 3 dígitos.",
        hint: "Los 3 primeros dígitos del CBU.",
        inList: true,
      },
    ],
  },
  "estado-civil": lookup(
    "estado-civil",
    "Estados civiles",
    "estado civil",
    "ESTADO_CIVIL",
    "Opciones de estado civil del legajo.",
  ),
  nacionalidades: lookup(
    "nacionalidades",
    "Nacionalidades",
    "nacionalidad",
    "NACIONALIDAD",
    "Opciones de nacionalidad del legajo.",
  ),
  modalidades: lookup(
    "modalidades",
    "Modalidades de trabajo",
    "modalidad",
    "MODALIDAD_TRABAJO",
    "Presencial, remoto, híbrido u otras.",
  ),
  "tipos-cuenta": lookup(
    "tipos-cuenta",
    "Tipos de cuenta bancaria",
    "tipo de cuenta",
    "TIPO_CUENTA_BANCARIA",
    "Tipos de cuenta para el depósito del sueldo.",
  ),
  "tipos-egreso": lookup(
    "tipos-egreso",
    "Tipos de egreso",
    "tipo de egreso",
    "TIPO_EGRESO",
    "Formas de extinción de la relación laboral.",
  ),
  "motivos-egreso": lookup(
    "motivos-egreso",
    "Motivos de egreso",
    "motivo de egreso",
    "MOTIVO_EGRESO",
    "Motivos informados al registrar un egreso.",
  ),
};

export function isCatalogKey(value: string): value is CatalogKey {
  return (CATALOG_KEYS as readonly string[]).includes(value);
}

/** Campo que se usa como nombre visible de cada elemento. */
export function labelField(def: CatalogDefinition): "name" | "label" {
  return def.lookupGroup ? "label" : "name";
}

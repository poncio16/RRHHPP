/**
 * Catálogos administrables con el ABM genérico de Configuración. Cada
 * definición describe los campos del formulario y las columnas del listado;
 * el repositorio sabe a qué tabla corresponde cada uno.
 *
 * Este archivo se usa también en el cliente: no importar nada del servidor.
 */

import { COUNTING_MODE_LABELS, LEAVE_CLASS_LABELS } from "@/features/leaves/constants";
import { NOVELTY_ORIGIN_LABELS } from "@/features/novelties/constants";
import { CONCEPT_NATURE_LABELS, SALARY_CONCEPT_KIND_LABELS } from "@/features/salaries/constants";

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
      /** Opción obligatoria de una lista fija. */
      type: "choice";
      options: readonly { value: string; label: string }[];
      /** Solo se elige en el alta; después no se puede cambiar. */
      immutable?: boolean;
      /** Admite quedar vacío ("Ninguno"). */
      optional?: boolean;
      hint?: string;
      inList?: boolean;
    }
  | {
      name: string;
      label: string;
      /** Cantidad de días opcional (entero de 1 a `max`). */
      type: "days";
      max: number;
      hint?: string;
      inList?: boolean;
    }
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
  documentacion: "Documentación",
  tiempo: "Licencias y ausencias",
  remuneraciones: "Remuneraciones y novedades",
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
  "tipos-documento",
  "tipos-licencia",
  "tipos-novedad",
  "conceptos-salariales",
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
  "tipos-documento": {
    key: "tipos-documento",
    title: "Tipos de documento",
    singular: "tipo de documento",
    description: "Documentación del legajo, con vencimiento y anticipación del aviso.",
    section: "documentacion",
    fields: [
      name(),
      {
        name: "requiresExpiry",
        label: "Tiene vencimiento",
        type: "boolean",
        hint: "Al cargar el documento se pide la fecha de vencimiento.",
        inList: true,
      },
      {
        name: "defaultValidityDays",
        label: "Vigencia habitual (días)",
        type: "days",
        max: 3650,
        hint: "Opcional. Sugiere el vencimiento a partir de la fecha de emisión.",
        inList: true,
      },
      {
        name: "alertDaysBefore",
        label: "Avisar con anticipación (días)",
        type: "days",
        max: 365,
        hint: "Opcional. Si se deja vacío se usa el valor general de Parámetros.",
        inList: true,
      },
      {
        name: "isSensitive",
        label: "Documentación sensible",
        type: "boolean",
        hint: "Datos de salud (certificados médicos, preocupacionales): solo la ven los roles con ese permiso.",
        inList: true,
      },
    ],
  },
  "tipos-licencia": {
    key: "tipos-licencia",
    title: "Tipos de licencia y ausencia",
    singular: "tipo de licencia",
    description: "Licencias, ausencias, vacaciones y suspensiones, con su forma de contar los días.",
    section: "tiempo",
    fields: [
      name(),
      {
        name: "class",
        label: "Clase",
        type: "choice",
        options: Object.entries(LEAVE_CLASS_LABELS).map(([value, label]) => ({ value, label })),
        immutable: true,
        hint: "Define en qué módulo aparece (las de clase Vacaciones descuentan del saldo anual). No se puede cambiar después del alta.",
        inList: true,
      },
      {
        name: "countingMode",
        label: "Cómo se cuentan los días",
        type: "choice",
        options: Object.entries(COUNTING_MODE_LABELS).map(([value, label]) => ({ value, label })),
        hint: "Los días hábiles usan el horario del empleado y los feriados. Se aplica a los registros nuevos.",
        inList: true,
      },
      { name: "isPaid", label: "Con goce de haberes", type: "boolean", inList: true },
      {
        name: "requiresCertificate",
        label: "Requiere certificado",
        type: "boolean",
        hint: "El registro muestra si falta adjuntar el certificado.",
      },
      {
        name: "maxDaysPerEvent",
        label: "Aviso: máximo de días por vez",
        type: "days",
        max: 365,
        hint: "Opcional. Si se supera se avisa al cargar, sin impedir el registro.",
      },
      {
        name: "maxDaysPerYear",
        label: "Aviso: máximo de días por año",
        type: "days",
        max: 365,
        hint: "Opcional. Suma los registros aprobados del año calendario.",
      },
      {
        name: "countsForAbsenteeism",
        label: "Cuenta para el ausentismo",
        type: "boolean",
        hint: "Se usa en el indicador y el reporte de ausentismo.",
      },
      {
        name: "isSensitive",
        label: "Dato de salud (sensible)",
        type: "boolean",
        hint: "Por ejemplo, enfermedad o accidente. Sin el permiso de datos de salud se ve como licencia reservada.",
        inList: true,
      },
      {
        name: "generatesNoveltyTypeId",
        label: "Genera novedad",
        type: "ref",
        source: { kind: "catalog", key: "tipos-novedad" },
        relation: "generatesNoveltyType",
        hint: "Opcional. Al generar las novedades de un período, cada registro aprobado da una novedad de este tipo con los días del mes.",
      },
    ],
  },
  "tipos-novedad": {
    key: "tipos-novedad",
    title: "Tipos de novedad",
    singular: "tipo de novedad",
    description: "Novedades hacia la liquidación: qué datos piden y qué hechos las generan.",
    section: "remuneraciones",
    fields: [
      name(),
      {
        name: "nature",
        label: "Naturaleza",
        type: "choice",
        options: Object.entries(CONCEPT_NATURE_LABELS).map(([value, label]) => ({ value, label })),
        hint: "Haber o descuento suman en los totales de importes; informativo no.",
        inList: true,
      },
      { name: "requiresAmount", label: "Requiere importe", type: "boolean", inList: true },
      { name: "requiresQuantity", label: "Requiere cantidad", type: "boolean", inList: true },
      {
        name: "quantityUnit",
        label: "Unidad de la cantidad",
        type: "text",
        max: 20,
        hint: "Por ejemplo, horas, días o veces.",
        inList: true,
      },
      {
        name: "generatedFrom",
        label: "Se genera desde",
        type: "choice",
        optional: true,
        options: Object.entries(NOVELTY_ORIGIN_LABELS).map(([value, label]) => ({ value, label })),
        hint: "Opcional. Al generar las novedades de un período se crean las de este tipo a partir de ese hecho. Cada hecho genera un solo tipo.",
        inList: true,
      },
    ],
  },
  "conceptos-salariales": {
    key: "conceptos-salariales",
    title: "Conceptos salariales",
    singular: "concepto salarial",
    description: "Conceptos de los renglones de los resúmenes informados por el sistema de liquidación.",
    section: "remuneraciones",
    fields: [
      name(),
      {
        name: "nature",
        label: "Naturaleza",
        type: "choice",
        options: Object.entries(CONCEPT_NATURE_LABELS).map(([value, label]) => ({ value, label })),
        hint: "Los haberes se comparan con el bruto informado y los descuentos, con los descuentos informados.",
        inList: true,
      },
      {
        name: "kind",
        label: "Clase",
        type: "choice",
        options: Object.entries(SALARY_CONCEPT_KIND_LABELS).map(([value, label]) => ({ value, label })),
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

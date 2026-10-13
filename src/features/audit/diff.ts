import { ALERT_KIND_LABELS } from "@/features/alerts/constants";
import { CATALOGS, type CatalogField } from "@/features/catalogs/definitions";
import { ATTENDANCE_STATUS_LABELS } from "@/features/attendance/constants";
import { DOCUMENT_STATUS_LABELS } from "@/features/documents/constants";
import { SEX_OPTIONS, STATUS_LABELS } from "@/features/employees/constants";
import { EXIT_STATUS_LABELS } from "@/features/exits/constants";
import { JOB_STATUS } from "@/features/imports/constants";
import {
  LEAVE_CLASS_FILTER_LABELS,
  LEAVE_STATUS_FILTER_LABELS,
  LEAVE_STATUS_LABELS,
  LEAVE_TIMING_FILTER_LABELS,
} from "@/features/leaves/constants";
import { NOVELTY_SOURCE_LABELS, NOVELTY_STATUS_LABELS } from "@/features/novelties/constants";
import { REPORTS } from "@/features/reports/definitions";
import { DAY_NAMES } from "@/features/schedules/calc";
import { formatDate, formatDateTime, formatMoney, formatPeriod, parsePeriod } from "@/lib/format";
import { formatCuil } from "@/lib/validators/cuil";
import { isPermission, PERMISSION_LABELS } from "@/server/authz/permissions";
import { SETTING_DEFINITIONS, type SettingFieldMeta } from "@/server/settings/definitions";
import {
  ACTION_LABELS,
  CATALOG_ENTITIES,
  entityLabel,
  FIELD_LABELS,
  moduleLabel,
  own,
  RESULT_LABELS,
} from "./constants";

/*
 * Antes y después de un evento como filas legibles. Los valores llegan como
 * JSON (fechas en ISO, importes como texto). Cada campo se nombra como en su
 * formulario, los códigos fijos (estados, sexo, permisos) por su nombre y los
 * IDs por lo que `labels` trae de la base; lo que no se reconoce se muestra
 * tal cual.
 */

export type DiffRow = { field: string; label: string; before: string | null; after: string | null; changed: boolean };

/** Lo que hace falta para leer un evento: el registro afectado y los nombres de los IDs que menciona. */
export type DiffContext = {
  labels?: Map<string, string>;
  entityType?: string | null;
  entityId?: string | null;
};

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_PERIOD = /^\d{4}-\d{2}$/;
const DECIMAL = /^-?\d+(\.\d+)?$/;

export function formatAuditValue(value: Json | undefined): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    if (ISO_DATE.test(value)) return formatDate(new Date(`${value}T00:00:00.000Z`));
    if (!ISO_INSTANT.test(value)) return value;
    const date = new Date(value);
    // Las fechas de calendario se guardan a medianoche UTC.
    return value.endsWith("T00:00:00.000Z") ? formatDate(date) : formatDateTime(date);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    return value.every((v) => typeof v !== "object" || v === null)
      ? value.map((v) => formatAuditValue(v) ?? "—").join(", ")
      : JSON.stringify(value);
  }
  return JSON.stringify(value);
}

const asObject = (value: unknown): Record<string, Json> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, Json>) : null;

const labelMap = (entries: readonly { value: string; label: string }[]) =>
  Object.fromEntries(entries.map((e) => [e.value, e.label]));

/** El estado de cada tipo de registro tiene sus propios valores. */
const STATUS_LABELS_BY_ENTITY: Record<string, Record<string, string>> = {
  Employee: STATUS_LABELS,
  LeaveRecord: LEAVE_STATUS_LABELS,
  AttendanceDay: ATTENDANCE_STATUS_LABELS,
  Document: DOCUMENT_STATUS_LABELS,
  EmployeeExit: EXIT_STATUS_LABELS,
  Novelty: NOVELTY_STATUS_LABELS,
  ImportJob: Object.fromEntries(Object.entries(JOB_STATUS).map(([value, s]) => [value, s.label])),
};

const LIST_TITLES: Record<string, string> = {
  empleados: "Empleados",
  licencias: "Licencias y ausencias",
  "listado-vacaciones": "Vacaciones",
  novedades: "Novedades",
  "planilla-novedades": "Planilla de novedades",
  auditoria: "Auditoría",
};

/** Códigos fijos de otros campos, iguales en todos los registros. */
const VALUE_LABELS: Record<string, Record<string, string>> = {
  sex: labelMap(SEX_OPTIONS),
  employeeStatus: STATUS_LABELS,
  sourceType: NOVELTY_SOURCE_LABELS,
  formato: { csv: "CSV", xlsx: "Excel" },
  recurso: { ...LIST_TITLES, ...Object.fromEntries(Object.entries(REPORTS).map(([slug, r]) => [slug, r.title])) },
};

/** Valores de un campo según el registro: para AlertDismissal, la acción sobre la alerta. */
const ENTITY_VALUE_LABELS: Record<string, Record<string, Record<string, string>>> = {
  AlertDismissal: { action: { posponer: "Posponer", descartar: "Descartar", restaurar: "Volver a pendientes" } },
};

/** Nombres de campo propios de un tipo de registro, cuando el general no alcanza. */
const ENTITY_FIELD_LABELS: Record<string, Record<string, string>> = {
  Employee: { email: "Email personal", supervisorId: "Superior directo" },
  User: { name: "Nombre y apellido", isActive: "Usuario activo" },
  SalaryHistory: { effectiveDate: "Rige desde" },
  WorkSchedule: { days: "Días y horarios" },
  Listado: { recurso: "Listado" },
  Reporte: { recurso: "Reporte" },
};

/** Claves de `filtros` (la consulta de la URL de una exportación). */
const FILTER_LABELS: Record<string, string> = {
  q: "Búsqueda",
  status: "Estado",
  estado: "Estado",
  sort: "Orden",
  periodo: "Período",
  anio: "Período",
  tipo: "Tipo",
  origen: "Origen",
  sector: "Sector",
  departmentId: "Sector",
  puesto: "Puesto",
  categoria: "Categoría",
  establecimiento: "Establecimiento",
  workplaceId: "Establecimiento",
  desde: "Desde",
  hasta: "Hasta",
  fecha: "Al",
  usuario: "Usuario",
  modulo: "Módulo",
  accion: "Acción",
  resultado: "Resultado",
  entidad: "Tipo de registro",
  registro: "Registro",
  class: "Clase",
  timing: "Momento",
  certificado: "Certificado",
};

const FILTER_VALUES: Record<string, (value: string) => string | undefined> = {
  modulo: moduleLabel,
  accion: (v) => ACTION_LABELS[v as keyof typeof ACTION_LABELS],
  resultado: (v) => RESULT_LABELS[v as keyof typeof RESULT_LABELS]?.label,
  entidad: entityLabel,
  // Filtros de Licencias y Vacaciones; los de otros listados no coinciden con estos valores.
  status: (v) => own(LEAVE_STATUS_FILTER_LABELS, v),
  class: (v) => own(LEAVE_CLASS_FILTER_LABELS, v),
  timing: (v) => own(LEAVE_TIMING_FILTER_LABELS, v),
  certificado: (v) => (v === "falta" ? "Falta el certificado" : undefined),
};

/** Filtros que pueden ser un mes ("2026-03"): el período de un listado o los extremos de Altas y bajas. */
const PERIOD_FILTERS = new Set(["periodo", "desde", "hasta"]);

const entityOwn = <T>(
  map: Record<string, Record<string, T>>,
  entityType: string | null | undefined,
  field: string,
): T | undefined => {
  const byField = entityType ? own(map, entityType) : undefined;
  return byField ? own(byField, field) : undefined;
};

const MONEY_FIELDS = new Set(["amount", "basicSalary", "grossReported", "deductionsReported", "netReported"]);
const NUMBER_FIELDS = new Set(["weeklyHours", "quantity"]);
const numberFormatter = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

function settingField(entityId: string | null | undefined, field: string): SettingFieldMeta | undefined {
  if (!entityId || !Object.hasOwn(SETTING_DEFINITIONS, entityId)) return undefined;
  const fields: readonly SettingFieldMeta[] = SETTING_DEFINITIONS[entityId as keyof typeof SETTING_DEFINITIONS].fields;
  return fields.find((f) => f.name === field);
}

function catalogField(entityType: string | null | undefined, field: string): CatalogField | undefined {
  const key = entityType ? own(CATALOG_ENTITIES, entityType) : undefined;
  return key ? CATALOGS[key].fields.find((f) => f.name === field) : undefined;
}

/** Nombre de un campo: el del formulario del parámetro o del catálogo, el propio del registro o el general. */
function fieldLabel(field: string, entityType: string | null | undefined, entityId: string | null | undefined) {
  if (entityType === "Setting") {
    const meta = settingField(entityId, field);
    if (meta) return `${meta.label} (${meta.unit})`;
  }
  return (
    catalogField(entityType, field)?.label ??
    entityOwn(ENTITY_FIELD_LABELS, entityType, field) ??
    own(FIELD_LABELS, field) ??
    field
  );
}

/** Orden de las filas: el del formulario del parámetro o del catálogo, o el de FIELD_LABELS. */
function fieldOrder(entityType: string | null | undefined, entityId: string | null | undefined): string[] {
  if (entityType === "Setting" && entityId && Object.hasOwn(SETTING_DEFINITIONS, entityId)) {
    const fields: readonly SettingFieldMeta[] =
      SETTING_DEFINITIONS[entityId as keyof typeof SETTING_DEFINITIONS].fields;
    return fields.map((f) => f.name);
  }
  const key = entityType ? own(CATALOG_ENTITIES, entityType) : undefined;
  if (key) return [...CATALOGS[key].fields.map((f) => f.name), "isActive"];
  return FIELD_KEYS;
}

const FIELD_KEYS = Object.keys(FIELD_LABELS);

function valueLabels(field: string, entityType: string | null | undefined): Record<string, string> | undefined {
  if (field === "status") return entityType ? own(STATUS_LABELS_BY_ENTITY, entityType) : undefined;
  const choice = catalogField(entityType, field);
  if (choice?.type === "choice") return labelMap(choice.options);
  return entityOwn(ENTITY_VALUE_LABELS, entityType, field) ?? own(VALUE_LABELS, field);
}

type Formatter = { labels: Map<string, string>; entityType: string | null | undefined };

/** Un valor simple, según su campo. */
function scalar(field: string, value: Json | undefined, f: Formatter): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return formatAuditValue(value);
  const values = valueLabels(field, f.entityType);
  const known = f.labels.get(value) ?? (values ? own(values, value) : undefined);
  if (known) return known;
  if (MONEY_FIELDS.has(field) && DECIMAL.test(value)) return formatMoney(value);
  if (NUMBER_FIELDS.has(field) && DECIMAL.test(value)) return numberFormatter.format(Number(value));
  if (field === "cuil" || field === "cuit") return formatCuil(value);
  if (field === "permissions" && isPermission(value)) return PERMISSION_LABELS[value];
  if (field === "alertKey") return own<string>(ALERT_KIND_LABELS, value.split(":")[0]!) ?? value;
  if (field === "days" && f.entityType === "WorkSchedule") return scheduleDays(value);
  if (ISO_PERIOD.test(value) && (field === "period" || field === "periodo")) {
    return formatPeriod(parsePeriod(value)) || value;
  }
  return formatAuditValue(value);
}

const SCHEDULE_DAY = /^([1-7]) (\d{2}:\d{2})-(\d{2}:\d{2}) \((\d+) min\)$/;

/** Los días de un horario se guardan como "1 09:00-18:00 (60 min), …" (1 es lunes). */
function scheduleDays(value: string): string {
  return value
    .split(", ")
    .map((day) => {
      const m = SCHEDULE_DAY.exec(day);
      return m ? `${DAY_NAMES[Number(m[1]) - 1]} de ${m[2]} a ${m[3]}, descanso ${m[4]} min` : day;
    })
    .join("\n");
}

/** Un concepto de un resumen informado: nombre, detalle, cantidad e importe. */
function payrollLine(line: Record<string, Json>, f: Formatter): string {
  const concept = scalar("conceptTypeId", line.conceptTypeId, f) ?? "Concepto";
  const description = typeof line.description === "string" && line.description ? ` (${line.description})` : "";
  const quantity = scalar("quantity", line.quantity, f);
  const amount = scalar("amount", line.amount, f) ?? "—";
  return `${concept}${description}${quantity ? `, cantidad ${quantity}` : ""}: ${amount}`;
}

/** Valor de una fila: listas y objetos van una línea por elemento. */
function display(field: string, value: Json | undefined, f: Formatter): string | null {
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    if (field === "lines") return value.map((line) => payrollLine(asObject(line) ?? {}, f)).join("\n");
    if (value.some((v) => v !== null && typeof v === "object")) return JSON.stringify(value);
    // Cada regla de vacaciones es "<rango>: <días>".
    const items = value.map((v) => scalar(field, v, f) ?? "—");
    return (field === "rules" ? items.map((rule) => `${rule} días`) : items).join("\n");
  }
  const object = asObject(value);
  if (object) {
    const lines = Object.entries(object).flatMap(([key, v]) => {
      if (v === null || v === "" || typeof v === "object") return [];
      const shown =
        typeof v !== "string"
          ? scalar(key, v, f)
          : (f.labels.get(v) ??
            own(FILTER_VALUES, key)?.(v) ??
            (PERIOD_FILTERS.has(key) && ISO_PERIOD.test(v) ? formatPeriod(parsePeriod(v)) || v : scalar(key, v, f)));
      return [`${own(FILTER_LABELS, key) ?? own(FIELD_LABELS, key) ?? key}: ${shown}`];
    });
    return lines.length > 0 ? lines.join("\n") : null;
  }
  return scalar(field, value, f);
}

/**
 * Campos que no se muestran porque repiten otro: el `id` (es el registro
 * afectado), el objeto vacío de una relación junto a su `…Id`, el ID del rol
 * junto a su nombre, el del archivo junto a su nombre y el origen de una
 * novedad que no se puede nombrar (el mismo empleado o un grupo de cambios).
 */
function redundant(
  keys: string[],
  b: Record<string, Json> | null,
  a: Record<string, Json> | null,
  labels: Map<string, string>,
): Set<string> {
  const has = new Set(keys);
  const sides = [b, a].filter((side): side is Record<string, Json> => side !== null);
  const hidden = new Set(["id"]);
  for (const key of keys) {
    const relationLeak =
      has.has(`${key}Id`) &&
      sides.every((side) => side[key] === undefined || side[key] === null || asObject(side[key]) !== null);
    if (relationLeak) hidden.add(key);
  }
  if (has.has("role")) hidden.add("roleId");
  if (has.has("fileName")) hidden.add("fileId");
  // El origen solo se muestra si se pudo nombrar (una licencia o un cambio de básico).
  if (sides.some((side) => typeof side.sourceId === "string" && !labels.has(side.sourceId))) hidden.add("sourceId");
  return hidden;
}

/**
 * Filas campo por campo. En un alta solo hay "después"; en una modificación,
 * los campos que cambiaron. Un valor que no es un objeto se muestra en una
 * fila "Detalle".
 */
export function diffRows(before: unknown, after: unknown, context: DiffContext = {}): DiffRow[] {
  const f: Formatter = { labels: context.labels ?? new Map(), entityType: context.entityType };
  const b = asObject(before);
  const a = asObject(after);
  if (!b && !a) {
    if ((before ?? null) === null && (after ?? null) === null) return [];
    return [
      {
        field: "",
        label: "Detalle",
        before: display("", before as Json, f),
        after: display("", after as Json, f),
        changed: true,
      },
    ];
  }
  const keys = [...new Set([...Object.keys(b ?? {}), ...Object.keys(a ?? {})])];
  const hidden = redundant(keys, b, a, f.labels);
  const order = fieldOrder(context.entityType, context.entityId);
  const rank = (field: string) => order.indexOf(field) + 1 || order.length + 1;
  return keys
    .filter((field) => !hidden.has(field))
    .sort((x, y) => rank(x) - rank(y))
    .map((field) => {
      const left = display(field, b?.[field], f);
      const right = display(field, a?.[field], f);
      return {
        field,
        label: fieldLabel(field, context.entityType, context.entityId),
        before: left,
        after: right,
        changed: !!b && !!a && left !== right,
      };
    });
}

import "server-only";
import { CATALOG_KEYS, CATALOGS } from "@/features/catalogs/definitions";
import { RESERVED_TYPE_LABEL } from "@/features/leaves/constants";
import { isReportSlug, REPORTS } from "@/features/reports/definitions";
import { EXPORT_MAX_ROWS, type Column, type ReportResult } from "@/features/reports/table";
import type { Prisma } from "@/generated/prisma/client";
import { formatDate, formatDateTime, parseIsoDate, periodKey, zonedInstant } from "@/lib/format";
import { paginate } from "@/lib/list/query";
import { ALL_PERMISSIONS, assertPermission, hasPermission, PERMISSION_LABELS } from "@/server/authz";
import type { ActorContext } from "@/server/context";
import { NotFoundError } from "@/server/errors";
import { SETTING_DEFINITIONS } from "@/server/settings/definitions";
import {
  ACTION_LABELS,
  auditMessage,
  CATALOG_ENTITIES,
  entityLabel,
  moduleLabel,
  own,
  RESULT_LABELS,
} from "./constants";
import { diffRows } from "./diff";
import * as repo from "./repository";
import { auditListQuerySchema, type AuditListQuery } from "./schemas";

const MODULE = "auditoria";

const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/**
 * Lo que un usuario sin permiso para datos de salud no puede ver de los
 * eventos: los nombres de los tipos de licencia sensibles. El detalle de una
 * licencia se guardó con el nombre del tipo, así que se reserva al leerlo.
 */
type HealthMask = { names: string[] } | null;

async function healthMask(ctx: ActorContext): Promise<HealthMask> {
  if (hasPermission(ctx, "document.sensitive:read")) return null;
  // Los nombres más largos primero, por si uno contiene a otro.
  return { names: (await repo.sensitiveLeaveTypeNames()).sort((a, b) => b.length - a.length) };
}

/**
 * Detalle legible de un evento: el permiso de un acceso denegado por su
 * nombre y, si corresponde, el tipo de licencia sensible reservado. Si el
 * tipo de la licencia es sensible pero su nombre ya no aparece (se renombró),
 * se reserva todo lo que sigue a "Acción: ".
 */
function readableMessage(
  entry: { entityType: string | null; message: string | null },
  mask: HealthMask,
  sensitiveRecord = false,
): string | null {
  const message = auditMessage(entry.message);
  if (!mask || !message || entry.entityType !== "LeaveRecord") return message;
  const masked = mask.names.reduce((text, name) => text.replaceAll(name, RESERVED_TYPE_LABEL), message);
  if (!sensitiveRecord || masked !== message) return masked;
  const prefix = message.indexOf(": ");
  return `${prefix > 0 ? message.slice(0, prefix + 2) : ""}${RESERVED_TYPE_LABEL}`;
}

/** Detalles de una página de eventos, con los tipos sensibles reservados si hace falta. */
async function readableMessages<
  T extends { entityType: string | null; entityId: string | null; message: string | null },
>(items: T[], mask: HealthMask): Promise<T[]> {
  const leaveIds = mask
    ? items.filter((e) => e.entityType === "LeaveRecord" && e.entityId).map((e) => e.entityId!)
    : [];
  const sensitive = leaveIds.length > 0 ? await repo.sensitiveLeaveRecordIds(leaveIds) : new Set<string>();
  return items.map((e) => ({ ...e, message: readableMessage(e, mask, !!e.entityId && sensitive.has(e.entityId)) }));
}

/**
 * Filtros → condición de búsqueda. Las fechas son días completos en la zona
 * horaria de la empresa. El texto busca también por el nombre del permiso de
 * un acceso denegado (se guarda el código); sin permiso para datos de salud,
 * una búsqueda que coincide con un tipo de licencia sensible no mira el
 * detalle de las licencias.
 */
function whereOf(query: AuditListQuery, mask: HealthMask): Prisma.AuditLogWhereInput {
  const q = query.q ? fold(query.q.replace(/"/g, "")).trim() : "";
  const deniedCodes = q ? ALL_PERMISSIONS.filter((code) => fold(PERMISSION_LABELS[code]).includes(q)) : [];
  const touchesHealth = !!mask && !!q && mask.names.some((name) => fold(name).includes(q) || q.includes(fold(name)));
  const from = query.desde ? parseIsoDate(query.desde) : null;
  const to = query.hasta ? parseIsoDate(query.hasta) : null;
  return {
    ...(from || to
      ? {
          occurredAt: {
            ...(from ? { gte: zonedInstant(from, 0) } : {}),
            ...(to ? { lt: zonedInstant(to, 24 * 60) } : {}),
          },
        }
      : {}),
    ...(query.usuario ? { userId: query.usuario } : {}),
    ...(query.modulo ? { module: query.modulo } : {}),
    ...(query.accion ? { action: query.accion } : {}),
    ...(query.resultado ? { result: query.resultado } : {}),
    ...(query.entidad ? { entityType: query.entidad } : {}),
    ...(query.registro ? { entityId: query.registro } : {}),
    ...(query.q
      ? {
          OR: [
            {
              message: { contains: query.q, mode: "insensitive" },
              ...(touchesHealth ? { NOT: { entityType: "LeaveRecord" } } : {}),
            },
            { userEmail: { contains: query.q, mode: "insensitive" } },
            ...(deniedCodes.length > 0
              ? [{ action: "ACCESS_DENIED" as const, message: { in: deniedCodes.map((c) => `Falta el permiso ${c}`) } }]
              : []),
          ],
        }
      : {}),
  };
}

export async function listAuditLog(ctx: ActorContext, rawQuery: unknown) {
  await assertPermission(ctx, "audit:read", MODULE);
  const query = auditListQuerySchema.parse(rawQuery);
  const mask = await healthMask(ctx);
  const { items, total } = await repo.listEntries(
    whereOf(query, mask),
    (query.page - 1) * query.pageSize,
    query.pageSize,
  );
  return { ...paginate(await readableMessages(items, mask), total, query.page, query.pageSize), query };
}

export async function getAuditFilterOptions(ctx: ActorContext) {
  await assertPermission(ctx, "audit:read", MODULE);
  const [modules, users] = await Promise.all([repo.usedModules(), repo.userOptions()]);
  return {
    modules: modules.map((m) => ({ value: m, label: moduleLabel(m) })).sort((a, b) => a.label.localeCompare(b.label)),
    users: users.map((u) => ({ value: u.id, label: `${u.name} (${u.email})` })),
  };
}

/** Pestaña del legajo donde se ve cada tipo de registro de un empleado. */
const EMPLOYEE_TABS: Record<string, string> = {
  LeaveRecord: "licencias",
  VacationBalance: "licencias",
  AttendanceDay: "asistencia",
  Document: "documentacion",
  EmployeeExit: "historial",
  EmployeeBankAccount: "bancarios",
  Novelty: "novedades",
  SalaryHistory: "remuneraciones",
  PayrollRecord: "remuneraciones",
};

/** Pantallas de Configuración y otras que muestran todos los registros de un tipo. */
const SCREENS: Record<string, string> = {
  Role: "/usuarios/roles",
  Setting: "/configuracion/parametros",
  Company: "/configuracion/empresa",
  VacationRule: "/configuracion/vacaciones",
  WorkSchedule: "/configuracion/horarios",
  Holiday: "/configuracion/feriados",
  AlertDismissal: "/alertas",
};

const LIST_SCREENS: Record<string, string> = {
  empleados: "/empleados",
  novedades: "/novedades",
  "planilla-novedades": "/novedades",
  auditoria: "/auditoria",
};

const snapshotName = (value: unknown) => {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const name = record.name ?? record.label;
  return typeof name === "string" && name ? name : null;
};

export type AffectedRecord = { label: string; name: string | null; href: string | null };

/** El registro afectado por su nombre y la pantalla donde se ve, si existe. */
async function affectedRecord(
  entry: { entityType: string | null; entityId: string | null; before: unknown; after: unknown },
  options: { canSeeHealth: boolean },
): Promise<AffectedRecord | null> {
  const { entityType: type, entityId: id } = entry;
  if (!type) return null;
  const found = id ? await repo.findEntityContext(type, id, options) : null;
  // Si ya no existe (un feriado eliminado), el nombre que quedó guardado en el evento.
  let name = found?.name ?? (id ? (snapshotName(entry.before) ?? snapshotName(entry.after)) : null);
  let href = own(SCREENS, type) ?? null;
  if (found && (type === "Employee" || type === "User" || type === "ImportJob")) {
    href = `${{ Employee: "/empleados", User: "/usuarios", ImportJob: "/importar" }[type]}/${id}`;
  } else if (type === "Session" && found?.userId) {
    href = `/usuarios/${found.userId}`;
  } else if (own(EMPLOYEE_TABS, type) && found?.employeeId) {
    const month = type === "AttendanceDay" && found.date ? `?mes=${periodKey(found.date)}` : "";
    href = `/empleados/${found.employeeId}/${EMPLOYEE_TABS[type]}${month}`;
  } else if (own(CATALOG_ENTITIES, type)) {
    const key =
      type === "LookupValue"
        ? CATALOG_KEYS.find((k) => found?.group && CATALOGS[k].lookupGroup === found.group)
        : CATALOG_ENTITIES[type];
    href = key ? `/configuracion/catalogos/${key}` : null;
  } else if (type === "Holiday" && found?.date) {
    href = `/configuracion/feriados?year=${found.date.getUTCFullYear()}`;
  } else if (type === "Setting" && id && Object.hasOwn(SETTING_DEFINITIONS, id)) {
    name = SETTING_DEFINITIONS[id as keyof typeof SETTING_DEFINITIONS].title;
  } else if (type === "Listado" || type === "Reporte") {
    const after = entry.after as { recurso?: unknown } | null;
    const resource = typeof after?.recurso === "string" ? after.recurso : "";
    if (type === "Reporte" && isReportSlug(resource)) {
      name = REPORTS[resource].title;
      href = `/reportes/${resource}`;
    } else if (type === "Listado" && Object.hasOwn(LIST_SCREENS, resource)) {
      href = LIST_SCREENS[resource]!;
    }
  }
  return { label: entityLabel(type), name, href };
}

export async function getAuditEntry(ctx: ActorContext, id: string) {
  await assertPermission(ctx, "audit:read", MODULE);
  const entry = await repo.findEntry(id);
  if (!entry) throw new NotFoundError("El evento no existe.");
  // Los tipos de licencia sensibles son datos de salud: mismo criterio que en Licencias.
  const mask = await healthMask(ctx);
  const options = { canSeeHealth: !mask };
  const [labels, record, [readable]] = await Promise.all([
    repo.referenceLabels([entry.before, entry.after], options),
    affectedRecord(entry, options),
    readableMessages([entry], mask),
  ]);
  return {
    ...entry,
    message: readable!.message,
    record,
    diff: diffRows(entry.before, entry.after, { labels, entityType: entry.entityType, entityId: entry.entityId }),
  };
}

/** Quién hizo el evento: el usuario, o el email que se intentó usar (login fallido). */
export function actorLabel(entry: { user: { name: string } | null; userEmail: string | null }) {
  return entry.user?.name ?? entry.userEmail ?? "Sin usuario";
}

/** Los eventos con los filtros de la pantalla, para exportar (sin el detalle de cada cambio). */
export async function exportAuditLog(ctx: ActorContext, rawQuery: unknown): Promise<ReportResult> {
  await assertPermission(ctx, "audit:read", MODULE);
  const query = auditListQuerySchema.parse(rawQuery);
  const mask = await healthMask(ctx);
  const [{ items, total }, user] = await Promise.all([
    repo.listEntries(whereOf(query, mask), 0, EXPORT_MAX_ROWS),
    query.usuario ? repo.findUser(query.usuario) : null,
  ]);
  const rows = await readableMessages(items, mask);
  const columns: Column[] = [
    { key: "occurredAt", label: "Fecha y hora" },
    { key: "user", label: "Usuario" },
    { key: "email", label: "Email" },
    { key: "action", label: "Acción" },
    { key: "module", label: "Módulo" },
    { key: "message", label: "Detalle" },
    { key: "entity", label: "Registro" },
    { key: "result", label: "Resultado" },
    { key: "ip", label: "IP" },
  ];
  const filters = [
    query.desde || query.hasta
      ? `Entre ${query.desde ? formatDate(parseIsoDate(query.desde)) : "el inicio"} y ${query.hasta ? formatDate(parseIsoDate(query.hasta)) : "hoy"}`
      : "Todas las fechas",
    ...(query.modulo ? [`Módulo: ${moduleLabel(query.modulo)}`] : []),
    ...(query.accion ? [`Acción: ${ACTION_LABELS[query.accion]}`] : []),
    ...(query.resultado ? [`Resultado: ${RESULT_LABELS[query.resultado].label}`] : []),
    ...(user ? [`Usuario: ${user.name} (${user.email})`] : []),
    ...(query.entidad || query.registro
      ? [`Registro: ${[query.entidad && entityLabel(query.entidad), query.registro].filter(Boolean).join(" ")}`]
      : []),
    ...(query.q ? [`Búsqueda: ${query.q}`] : []),
  ];
  return {
    title: "Auditoría",
    filters,
    notice:
      total > items.length
        ? `Se exportan los ${items.length} eventos más recientes de ${total}. Acotá los filtros para ver el resto.`
        : undefined,
    tables: [
      {
        id: "eventos",
        title: "Eventos",
        columns,
        empty: "No hay eventos con estos filtros.",
        rows: rows.map((e) => ({
          occurredAt: formatDateTime(e.occurredAt),
          user: e.user?.name ?? null,
          email: e.userEmail,
          action: ACTION_LABELS[e.action],
          module: moduleLabel(e.module),
          message: e.message,
          entity: e.entityType ? [entityLabel(e.entityType), e.entityId].filter(Boolean).join(" ") : null,
          result: RESULT_LABELS[e.result].label,
          ip: e.ip,
        })),
      },
    ],
  };
}

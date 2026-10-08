import "server-only";
import { EXPORT_MAX_ROWS, type Column, type ReportResult } from "@/features/reports/table";
import type { Prisma } from "@/generated/prisma/client";
import { formatDate, formatDateTime, parseIsoDate, zonedInstant } from "@/lib/format";
import { paginate } from "@/lib/list/query";
import { assertPermission } from "@/server/authz";
import type { ActorContext } from "@/server/context";
import { NotFoundError } from "@/server/errors";
import { ACTION_LABELS, moduleLabel, RESULT_LABELS } from "./constants";
import { diffRows } from "./diff";
import * as repo from "./repository";
import { auditListQuerySchema, type AuditListQuery } from "./schemas";

const MODULE = "auditoria";

/** Filtros → condición de búsqueda. Las fechas son días completos en la zona horaria de la empresa. */
function whereOf(query: AuditListQuery): Prisma.AuditLogWhereInput {
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
            { message: { contains: query.q, mode: "insensitive" } },
            { userEmail: { contains: query.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export async function listAuditLog(ctx: ActorContext, rawQuery: unknown) {
  await assertPermission(ctx, "audit:read", MODULE);
  const query = auditListQuerySchema.parse(rawQuery);
  const { items, total } = await repo.listEntries(whereOf(query), (query.page - 1) * query.pageSize, query.pageSize);
  return { ...paginate(items, total, query.page, query.pageSize), query };
}

export async function getAuditFilterOptions(ctx: ActorContext) {
  await assertPermission(ctx, "audit:read", MODULE);
  const [modules, users] = await Promise.all([repo.usedModules(), repo.userOptions()]);
  return {
    modules: modules.map((m) => ({ value: m, label: moduleLabel(m) })).sort((a, b) => a.label.localeCompare(b.label)),
    users: users.map((u) => ({ value: u.id, label: `${u.name} (${u.email})` })),
  };
}

export async function getAuditEntry(ctx: ActorContext, id: string) {
  await assertPermission(ctx, "audit:read", MODULE);
  const entry = await repo.findEntry(id);
  if (!entry) throw new NotFoundError("El evento no existe.");
  return {
    ...entry,
    diff: diffRows(entry.before, entry.after, await repo.referenceLabels([entry.before, entry.after])),
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
  const [{ items, total }, user] = await Promise.all([
    repo.listEntries(whereOf(query), 0, EXPORT_MAX_ROWS),
    query.usuario ? repo.findUser(query.usuario) : null,
  ]);
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
      ? [`Registro: ${[query.entidad, query.registro].filter(Boolean).join(" ")}`]
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
        rows: items.map((e) => ({
          occurredAt: formatDateTime(e.occurredAt),
          user: e.user?.name ?? null,
          email: e.userEmail,
          action: ACTION_LABELS[e.action],
          module: moduleLabel(e.module),
          message: e.message,
          entity: e.entityType ? [e.entityType, e.entityId].filter(Boolean).join(" ") : null,
          result: RESULT_LABELS[e.result].label,
          ip: e.ip,
        })),
      },
    ],
  };
}

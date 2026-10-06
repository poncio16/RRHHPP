import "server-only";
import type { AuditAction, AuditResult, Prisma } from "@/generated/prisma/client";
import type { ActorContext, RequestMeta } from "../context";
import { db } from "../db";
import type { AuditJson } from "./mask";

export { auditDiff, sanitizeForAudit } from "./mask";

type AuditClient = Pick<Prisma.TransactionClient, "auditLog">;

export type AuditEntry = {
  action: AuditAction;
  module: string;
  entityType?: string;
  entityId?: string;
  before?: Record<string, AuditJson> | AuditJson[] | null;
  after?: Record<string, AuditJson> | AuditJson[] | null;
  result?: AuditResult;
  message?: string;
};

/** Actor de un evento: un usuario con sesión, o solo metadatos (p. ej. login fallido). */
export type AuditActor = ActorContext | (RequestMeta & { userId?: string | null; email?: string | null });

/**
 * Registra un evento. Pasar el cliente de la transacción (`tx`) cuando el
 * evento acompaña un cambio de datos: así se guardan juntos o no se guarda nada.
 */
export async function recordAudit(actor: AuditActor, entry: AuditEntry, client: AuditClient = db): Promise<void> {
  await client.auditLog.create({
    data: {
      userId: actor.userId ?? null,
      userEmail: actor.email ?? null,
      ip: actor.ip,
      userAgent: actor.userAgent?.slice(0, 500) ?? null,
      action: entry.action,
      module: entry.module,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      before: (entry.before ?? undefined) as Prisma.InputJsonValue | undefined,
      after: (entry.after ?? undefined) as Prisma.InputJsonValue | undefined,
      result: entry.result ?? "SUCCESS",
      message: entry.message ?? null,
    },
  });
}

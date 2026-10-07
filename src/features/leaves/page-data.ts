import "server-only";
import { loadDocumentFormData } from "@/features/documents/page-data";
import { hasPermission } from "@/server/authz";
import type { ActorContext } from "@/server/context";
import { getLeaveTypeOptions } from "./service";

/** Tipos para los filtros y, si el usuario puede registrar, datos de los formularios. */
export async function loadLeaveFormData(ctx: ActorContext) {
  const types = await getLeaveTypeOptions(ctx);
  const canApprove = hasPermission(ctx, "leave:approve");
  const canWrite = hasPermission(ctx, "leave:write");
  const canAttach = canWrite && hasPermission(ctx, "document:read") && hasPermission(ctx, "document:write");
  const documents = canAttach ? (await loadDocumentFormData(ctx)).edit : null;
  return { types, canApprove, edit: canWrite ? { types, canApprove, documents } : null };
}

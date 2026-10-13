import "server-only";
import { loadDocumentFormData } from "@/features/documents/page-data";
import { hasPermission } from "@/server/authz";
import type { ActorContext } from "@/server/context";
import { canAttachCertificate, getLeaveTypeOptions } from "./service";

/** Tipos para los filtros y, si el usuario puede registrar, datos de los formularios. */
export async function loadLeaveFormData(ctx: ActorContext) {
  const types = await getLeaveTypeOptions(ctx);
  const canApprove = hasPermission(ctx, "leave:approve");
  const canWrite = hasPermission(ctx, "leave:write");
  const canAttach = canAttachCertificate(ctx);
  const documents = canAttach ? (await loadDocumentFormData(ctx)).edit : null;
  return { types, canApprove, edit: canWrite ? { types, canApprove, documents } : null };
}

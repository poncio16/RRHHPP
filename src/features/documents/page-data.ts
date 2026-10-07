import "server-only";
import { hasPermission } from "@/server/authz";
import type { ActorContext } from "@/server/context";
import { getDocumentTypeOptions, getUploadLimits } from "./service";

/** Tipos para los filtros y, si el usuario puede registrar, datos del formulario. */
export async function loadDocumentFormData(ctx: ActorContext) {
  const [types, limits] = await Promise.all([getDocumentTypeOptions(ctx), getUploadLimits()]);
  const canWrite = hasPermission(ctx, "document:write");
  return { types, edit: canWrite ? { types, limits } : null };
}

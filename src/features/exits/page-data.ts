import "server-only";
import { loadDocumentFormData } from "@/features/documents/page-data";
import { toIsoDate, todayInTimeZone } from "@/lib/format";
import { hasPermission } from "@/server/authz";
import type { ActorContext } from "@/server/context";
import type { ExitEditOptions } from "./components/exit-actions";
import { getExitOptions } from "./service";

/** Tipos y motivos (filtros) y, si el usuario puede registrar, datos de los formularios. */
export async function loadExitFormData(ctx: ActorContext, includeIds: string[] = []) {
  const options = await getExitOptions(ctx, includeIds);
  if (!hasPermission(ctx, "exit:write")) return { options, edit: null };
  const canAttach = hasPermission(ctx, "document:read") && hasPermission(ctx, "document:write");
  const edit: ExitEditOptions = {
    ...options,
    today: toIsoDate(todayInTimeZone()),
    documents: canAttach ? (await loadDocumentFormData(ctx)).edit : null,
  };
  return { options, edit };
}

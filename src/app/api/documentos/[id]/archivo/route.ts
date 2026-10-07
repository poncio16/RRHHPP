import { connection } from "next/server";
import { openDocumentFile } from "@/features/documents/service";
import { z } from "@/lib/zod";
import { requireActionContext } from "@/server/auth/request";
import { NotFoundError, toAppError } from "@/server/errors";
import { logger } from "@/server/logger";

/**
 * Descarga del archivo de un documento. Verifica la sesión y los permisos en
 * cada pedido, registra la descarga y siempre fuerza la descarga (nunca se
 * muestra en línea) para que el contenido no se interprete en el sitio.
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/documentos/[id]/archivo">) {
  await connection();
  try {
    const ctx = await requireActionContext(null, "documentacion");
    const parsed = z.uuid().safeParse((await params).id);
    if (!parsed.success) throw new NotFoundError("El documento no existe.");
    const file = await openDocumentFile(ctx, parsed.data);
    return new Response(file.stream, {
      headers: {
        "Content-Type": file.mime,
        "Content-Length": String(file.size),
        "Content-Disposition": `attachment; filename="${asciiName(file.name)}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const appError = toAppError(error);
    if (!appError) logger.error({ err: error }, "Error al descargar un archivo");
    return new Response(appError?.message ?? "No se pudo descargar el archivo.", {
      status: appError?.httpStatus ?? 500,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}

/** Nombre de respaldo para navegadores sin soporte de `filename*`. */
function asciiName(name: string) {
  return (
    name
      .normalize("NFD")
      .replace(/[^\x20-\x7e]/g, "")
      .replace(/["\\]/g, "") || "archivo"
  );
}

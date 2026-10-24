import { connection } from "next/server";
import { exportResource } from "@/features/reports/export";
import { requireActionContext } from "@/server/auth/request";
import { toAppError } from "@/server/errors";
import { logger } from "@/server/logger";

/**
 * Descarga de un reporte o listado en CSV o Excel. Los filtros llegan en la
 * URL, igual que en la pantalla. Verifica sesión y permisos en cada pedido.
 */
export async function GET(request: Request, { params }: RouteContext<"/api/exportar/[recurso]">) {
  await connection();
  try {
    const ctx = await requireActionContext(null, "reportes");
    const search = Object.fromEntries(new URL(request.url).searchParams);
    const file = await exportResource(ctx, (await params).recurso, search);
    return new Response(streamOf(file.body), {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${file.fileName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const appError = toAppError(error);
    if (!appError) logger.error({ err: error }, "Error al exportar");
    return new Response(appError?.message ?? "No se pudo generar el archivo.", {
      status: appError?.httpStatus ?? 500,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}

const CHUNK_BYTES = 64 * 1024;

/**
 * El archivo sale de a pedazos: en Vercel, una respuesta de una sola vez no
 * puede superar 4,5 MB y una enviada como stream no tiene ese límite.
 */
function streamOf(body: Uint8Array | string): ReadableStream<Uint8Array> {
  const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.byteLength) return controller.close();
      controller.enqueue(bytes.subarray(offset, offset + CHUNK_BYTES));
      offset += CHUNK_BYTES;
    },
  });
}

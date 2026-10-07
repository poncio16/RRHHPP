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
    return new Response(file.body, {
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

import { connection } from "next/server";
import { getTemplate } from "@/features/imports/service";
import { requireActionContext } from "@/server/auth/request";
import { toAppError } from "@/server/errors";
import { logger } from "@/server/logger";

/** Plantilla Excel de importación, con los valores activos de cada catálogo. */
export async function GET() {
  await connection();
  try {
    const ctx = await requireActionContext("import:run", "importacion");
    const body = await getTemplate(ctx);
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="plantilla-empleados.xlsx"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const appError = toAppError(error);
    if (!appError) logger.error({ err: error }, "Error al generar la plantilla de importación");
    return new Response(appError?.message ?? "No se pudo generar la plantilla.", {
      status: appError?.httpStatus ?? 500,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}

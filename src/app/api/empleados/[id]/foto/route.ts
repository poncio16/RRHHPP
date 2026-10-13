import { connection } from "next/server";
import { openEmployeePhoto } from "@/features/employees/service";
import { z } from "@/lib/zod";
import { requireActionContext } from "@/server/auth/request";
import { NotFoundError, toAppError } from "@/server/errors";
import { logger } from "@/server/logger";

/**
 * Foto del legajo. Verifica la sesión y el permiso en cada pedido: el
 * navegador puede guardarla, pero vuelve a preguntar siempre (`no-cache`) y
 * recibe un 304 si sigue siendo la misma foto.
 */
export async function GET(request: Request, { params }: RouteContext<"/api/empleados/[id]/foto">) {
  await connection();
  try {
    const ctx = await requireActionContext(null, "empleados");
    const parsed = z.uuid().safeParse((await params).id);
    if (!parsed.success) throw new NotFoundError("El legajo no existe.");
    const photo = await openEmployeePhoto(ctx, parsed.data, etagValue(request.headers.get("if-none-match")));
    const headers = {
      ETag: `"${photo.fileId}"`,
      "Cache-Control": "private, no-cache",
      "X-Content-Type-Options": "nosniff",
    };
    if (!photo.file) return new Response(null, { status: 304, headers });
    return new Response(photo.file.stream, {
      headers: {
        ...headers,
        "Content-Type": photo.mime,
        "Content-Length": String(photo.file.size),
        "Content-Disposition": `inline; filename="${photo.name}"`,
      },
    });
  } catch (error) {
    const appError = toAppError(error);
    if (!appError) logger.error({ err: error }, "Error al mostrar la foto de un legajo");
    return new Response(appError?.message ?? "No se pudo mostrar la foto.", {
      status: appError?.httpStatus ?? 500,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}

/** Id de la foto que el navegador ya tiene, si mandó uno solo. */
function etagValue(header: string | null): string | null {
  const match = header?.trim().match(/^(?:W\/)?"([0-9a-f-]{36})"$/);
  return match?.[1] ?? null;
}

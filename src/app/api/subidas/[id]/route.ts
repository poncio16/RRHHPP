import { connection } from "next/server";
import { receiveUpload } from "@/features/uploads/service";
import { z } from "@/lib/zod";
import { requireActionContext } from "@/server/auth/request";
import { errorResponse, NotFoundError } from "@/server/errors";

/**
 * Recibe el archivo de una subida directa cuando los archivos se guardan en el
 * disco local. Solo lo acepta del mismo usuario que pidió la subida y hasta el
 * tamaño permitido; el tipo real se valida al guardar el formulario.
 */
export async function PUT(request: Request, { params }: RouteContext<"/api/subidas/[id]">) {
  await connection();
  try {
    const ctx = await requireActionContext(null, "documentacion");
    const parsed = z.uuid().safeParse((await params).id);
    if (!parsed.success) throw new NotFoundError("La subida venció o no existe. Volvé a guardar el formulario.");
    const length = Number(request.headers.get("content-length"));
    await receiveUpload(ctx, parsed.data, request.body, Number.isFinite(length) && length > 0 ? length : null);
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

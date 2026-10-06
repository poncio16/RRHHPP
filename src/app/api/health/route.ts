import { connection } from "next/server";
import { getSystemStatus } from "@/features/system/service";

/** Chequeo de salud para el monitoreo y el despliegue. No expone datos de negocio. */
export async function GET() {
  await connection();
  const status = await getSystemStatus();
  const ok = status.database === "ok";
  return Response.json({ status: ok ? "ok" : "error", database: status.database }, { status: ok ? 200 : 503 });
}

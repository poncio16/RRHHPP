import "server-only";
import { logger } from "@/server/logger";
import * as repo from "./repository";

export type SystemStatus =
  | { database: "ok"; migrations: number; reference: { provinces: number; lookupValues: number } }
  | { database: "error" };

/** Estado real de la instalación: conexión, migraciones aplicadas y catálogos de referencia. */
export async function getSystemStatus(): Promise<SystemStatus> {
  try {
    await repo.pingDatabase();
    const [migrations, reference] = await Promise.all([repo.countAppliedMigrations(), repo.countReferenceData()]);
    return { database: "ok", migrations, reference };
  } catch (error) {
    logger.error({ err: error }, "No se pudo consultar el estado de la base de datos");
    return { database: "error" };
  }
}

export async function getCompanyDisplayName(): Promise<string> {
  return (await repo.findCompanyName()) ?? "Empresa sin configurar";
}

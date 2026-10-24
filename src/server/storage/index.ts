import "server-only";
import { env } from "../env";
import { logger } from "../logger";
import type { StorageDriver } from "./common";
import { localDriver } from "./local";
import { vercelBlobDriver } from "./vercel-blob";

export * from "./common";

let driver: StorageDriver | undefined;

export function storage(): StorageDriver {
  driver ??= env.STORAGE_DRIVER === "vercel-blob" ? vercelBlobDriver() : localDriver(env.STORAGE_DIR);
  return driver;
}

/**
 * Guarda el archivo (salvo que ya lo haya subido el navegador) y ejecuta
 * `persist`; si la base falla, descarta el archivo, que nunca quedó asociado
 * a un registro.
 */
export async function withStoredFile<T>(
  file: { key: string; bytes: Uint8Array; uploaded?: boolean } | null,
  persist: () => Promise<T>,
): Promise<T> {
  if (!file) return persist();
  if (!file.uploaded) await storage().put(file.key, file.bytes);
  try {
    return await persist();
  } catch (error) {
    await discardQuietly(file.key);
    throw error;
  }
}

/** Descarta un archivo sin asociar; si no se puede, lo deja en el log. */
export async function discardQuietly(key: string): Promise<void> {
  await storage()
    .discard(key)
    .catch((e: unknown) => logger.error({ err: e, key }, "No se pudo descartar un archivo huérfano"));
}

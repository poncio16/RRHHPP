import "server-only";
import type { ActorContext } from "@/server/context";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { logger } from "@/server/logger";
import {
  discardQuietly,
  FileExistsError,
  FileTooLargeError,
  newStorageKey,
  readLimited,
  storage,
  type UploadTarget,
} from "@/server/storage";
import * as repo from "./repository";

/**
 * Subidas directas: el navegador sube el archivo al almacenamiento y después
 * manda el formulario con el id de la subida. Cada subida es de un usuario,
 * sirve una sola vez y vence a los 30 minutos (el archivo se sube apenas se
 * guarda el formulario).
 */
export const UPLOAD_TTL_MINUTES = 30;
/**
 * Después, con margen por si alguna se está guardando, se descartan las
 * subidas viejas y sus archivos, salvo los que quedaron registrados.
 */
const DISCARD_AFTER_MINUTES = 2 * UPLOAD_TTL_MINUTES;
const CLEANUP_BATCH = 20;

export type PreparedUpload = { uploadId: string } & UploadTarget;

const minutesAgo = (minutes: number, now = new Date()) => new Date(now.getTime() - minutes * 60_000);

const fileError = (message: string) => new ValidationError(undefined, { file: [message] });
const tooLarge = (maxBytes: number) =>
  fileError(`El archivo supera el máximo de ${Math.round(maxBytes / (1024 * 1024))} MB.`);

/**
 * Prepara una subida de hasta `maxBytes`. Quien la pide ya verificó los
 * permisos del formulario que la va a usar.
 */
export async function createUpload(ctx: ActorContext, maxBytes: number): Promise<PreparedUpload> {
  const upload = await repo.createPendingUpload({ storageKey: newStorageKey(), userId: ctx.userId, maxBytes });
  const expiresAt = new Date(upload.createdAt.getTime() + UPLOAD_TTL_MINUTES * 60_000);
  const target = await storage().uploadTarget({ id: upload.id, key: upload.storageKey, maxBytes, expiresAt });
  await discardExpiredUploads().catch((error: unknown) =>
    logger.error({ err: error }, "No se pudieron descartar las subidas vencidas"),
  );
  return { uploadId: upload.id, ...target };
}

/**
 * Recibe el archivo de una subida en la propia aplicación (disco local, ruta
 * `/api/subidas/[id]`). En Vercel el navegador sube directo al almacén.
 */
export async function receiveUpload(
  ctx: ActorContext,
  id: string,
  body: ReadableStream<Uint8Array> | null,
  declaredBytes: number | null,
): Promise<void> {
  const upload = await repo.findOpenUpload(id, ctx.userId, minutesAgo(UPLOAD_TTL_MINUTES));
  if (!upload) throw new NotFoundError("La subida venció o no existe. Volvé a guardar el formulario.");
  if (!body) throw fileError("No llegó el archivo.");
  if (declaredBytes !== null && declaredBytes > upload.maxBytes) throw tooLarge(upload.maxBytes);
  const bytes = await readLimited(body, upload.maxBytes).catch((error: unknown) => {
    throw error instanceof FileTooLargeError ? tooLarge(upload.maxBytes) : error;
  });
  if (bytes.byteLength === 0) throw fileError("No llegó el archivo.");
  await storage()
    .put(upload.storageKey, bytes)
    .catch((error: unknown) => {
      throw error instanceof FileExistsError ? new ConflictError("El archivo de esta subida ya llegó.") : error;
    });
}

/**
 * Usa la subida al guardar el formulario y devuelve el archivo completo para
 * validarlo. Desde ese momento no se puede volver a usar. Si el archivo no sirve,
 * se descarta: nunca quedó asociado a un registro.
 */
export async function claimUpload(ctx: ActorContext, id: string): Promise<{ key: string; bytes: Uint8Array }> {
  const upload = await repo.claimPendingUpload(id, ctx.userId, minutesAgo(UPLOAD_TTL_MINUTES));
  if (!upload) throw fileError("La subida del archivo venció. Elegilo de nuevo y volvé a guardar.");
  const key = upload.storageKey;
  let bytes: Uint8Array | null;
  try {
    bytes = await storage().read(key, upload.maxBytes);
  } catch (error) {
    await discardQuietly(key);
    throw error instanceof FileTooLargeError ? tooLarge(upload.maxBytes) : error;
  }
  if (!bytes || bytes.byteLength === 0) {
    if (bytes) await discardQuietly(key);
    throw fileError("No llegó el archivo. Volvé a guardar el formulario.");
  }
  return { key, bytes };
}

/**
 * Descarta las subidas viejas. Su archivo se borra salvo que haya quedado
 * registrado: el de una subida que nadie usó, el que llegó después de que se
 * guardó el formulario sin él o el de un guardado que falló.
 */
export async function discardExpiredUploads(now = new Date()): Promise<number> {
  const expired = await repo.listExpiredUploads(minutesAgo(DISCARD_AFTER_MINUTES, now), CLEANUP_BATCH);
  let discarded = 0;
  for (const upload of expired) {
    try {
      if (!(await repo.isStoredKey(upload.storageKey))) await storage().discard(upload.storageKey);
      await repo.deletePendingUpload(upload.id);
      discarded++;
    } catch (error) {
      logger.error({ err: error, uploadId: upload.id }, "No se pudo descartar una subida vencida");
    }
  }
  return discarded;
}

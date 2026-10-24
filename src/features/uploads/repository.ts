import "server-only";
import { db } from "@/server/db";

export type PendingUploadRecord = {
  id: string;
  storageKey: string;
  userId: string;
  maxBytes: number;
  createdAt: Date;
  claimedAt: Date | null;
};

export async function createPendingUpload(data: {
  storageKey: string;
  userId: string;
  maxBytes: number;
}): Promise<PendingUploadRecord> {
  return db.pendingUpload.create({ data });
}

/** La subida pendiente de ese usuario, si todavía no venció ni se usó. */
export async function findOpenUpload(id: string, userId: string, since: Date): Promise<PendingUploadRecord | null> {
  return db.pendingUpload.findFirst({ where: { id, userId, createdAt: { gt: since }, claimedAt: null } });
}

/**
 * Marca la subida como usada y la devuelve. Si dos pedidos la usan a la vez,
 * solo uno la obtiene. La fila queda hasta que se descarta por vieja.
 */
export async function claimPendingUpload(id: string, userId: string, since: Date): Promise<PendingUploadRecord | null> {
  const { count } = await db.pendingUpload.updateMany({
    where: { id, userId, createdAt: { gt: since }, claimedAt: null },
    data: { claimedAt: new Date() },
  });
  return count === 1 ? db.pendingUpload.findUnique({ where: { id } }) : null;
}

/** Subidas viejas, usadas o no, las más viejas primero. */
export async function listExpiredUploads(before: Date, take: number): Promise<PendingUploadRecord[]> {
  return db.pendingUpload.findMany({ where: { createdAt: { lt: before } }, orderBy: { createdAt: "asc" }, take });
}

/** Si un archivo quedó registrado (es el adjunto de un documento). */
export async function isStoredKey(storageKey: string): Promise<boolean> {
  return (await db.storedFile.count({ where: { storageKey } })) > 0;
}

export async function deletePendingUpload(id: string): Promise<void> {
  await db.pendingUpload.deleteMany({ where: { id } });
}

import "server-only";
import { db } from "@/server/db";

export type PendingUploadRecord = { id: string; storageKey: string; userId: string; maxBytes: number; createdAt: Date };

export async function createPendingUpload(data: {
  storageKey: string;
  userId: string;
  maxBytes: number;
}): Promise<PendingUploadRecord> {
  return db.pendingUpload.create({ data });
}

/** La subida pendiente de ese usuario, si todavía no venció. */
export async function findPendingUpload(id: string, userId: string, since: Date): Promise<PendingUploadRecord | null> {
  return db.pendingUpload.findFirst({ where: { id, userId, createdAt: { gt: since } } });
}

/**
 * Consume la subida pendiente: la borra y la devuelve. Si dos pedidos la
 * consumen a la vez, solo uno la obtiene.
 */
export async function claimPendingUpload(id: string, userId: string, since: Date): Promise<PendingUploadRecord | null> {
  const upload = await findPendingUpload(id, userId, since);
  if (!upload) return null;
  const { count } = await db.pendingUpload.deleteMany({ where: { id: upload.id } });
  return count === 1 ? upload : null;
}

/** Subidas que nadie usó, las más viejas primero. */
export async function listAbandonedUploads(before: Date, take: number): Promise<PendingUploadRecord[]> {
  return db.pendingUpload.findMany({ where: { createdAt: { lt: before } }, orderBy: { createdAt: "asc" }, take });
}

export async function deletePendingUpload(id: string): Promise<void> {
  await db.pendingUpload.deleteMany({ where: { id } });
}

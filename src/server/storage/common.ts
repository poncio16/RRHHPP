import { randomUUID } from "node:crypto";

/**
 * Almacenamiento de archivos. Con Docker se usa el disco local (`STORAGE_DIR`,
 * un volumen persistente); en Vercel, un almacén privado de Vercel Blob
 * (`STORAGE_DRIVER=vercel-blob`). Los archivos nunca se sirven directo: se
 * descargan por una ruta autenticada que verifica permisos.
 *
 * Los adjuntos de los documentos los sube el navegador directo al almacén
 * (`uploadTarget`), sin pasar por una server action: Vercel corta los pedidos
 * de más de 4,5 MB. Después el servidor los lee completos (`read`) para
 * validarlos antes de registrarlos.
 */
export interface StorageDriver {
  /** Guarda un archivo que llegó al servidor (la foto del legajo). */
  put(key: string, data: Uint8Array): Promise<void>;
  open(key: string): Promise<{ stream: ReadableStream<Uint8Array>; size: number }>;
  /** Lee completo un archivo subido directo por el navegador. `null` si nunca llegó. */
  read(key: string, maxBytes: number): Promise<Uint8Array | null>;
  /** Solo para deshacer una subida cuyo registro no llegó a guardarse (o que nadie usó). */
  discard(key: string): Promise<void>;
  /** Adónde sube el navegador el archivo de una subida pendiente, y con qué encabezados. */
  uploadTarget(upload: PendingUploadTarget): Promise<UploadTarget>;
}

export type PendingUploadTarget = { id: string; key: string; maxBytes: number; expiresAt: Date };
export type UploadTarget = { url: string; headers: Record<string, string> };

/** El archivo supera el tamaño permitido para esa subida. */
export class FileTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`El archivo supera ${maxBytes} bytes.`);
  }
}

const KEY_PATTERN = /^\d{4}\/\d{2}\/[0-9a-f-]{36}$/;

/** Clave interna aleatoria por año y mes: nunca depende del nombre que subió el usuario. */
export function newStorageKey(now = new Date()): string {
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${now.getUTCFullYear()}/${month}/${randomUUID()}`;
}

export function assertStorageKey(key: string): void {
  if (!KEY_PATTERN.test(key)) throw new Error(`Clave de almacenamiento inválida: ${key}`);
}

/** Lee un stream completo sin pasarse de `maxBytes`. */
export async function readLimited(stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new FileTooLargeError(maxBytes);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

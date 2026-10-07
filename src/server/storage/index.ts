import "server-only";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { env } from "../env";

/**
 * Almacenamiento de archivos. V1 usa disco local (`STORAGE_DIR`, un volumen
 * persistente); la interfaz permite sumar un driver compatible con S3 sin
 * tocar los módulos que la usan. Los archivos nunca se sirven directo: se
 * descargan por una ruta autenticada que verifica permisos.
 */
export interface StorageDriver {
  put(key: string, data: Uint8Array): Promise<void>;
  open(key: string): Promise<{ stream: ReadableStream<Uint8Array>; size: number }>;
  /** Solo para deshacer una subida cuyo registro no llegó a guardarse. */
  discard(key: string): Promise<void>;
}

const KEY_PATTERN = /^\d{4}\/\d{2}\/[0-9a-f-]{36}$/;

/** Clave interna aleatoria por año y mes: nunca depende del nombre que subió el usuario. */
export function newStorageKey(now = new Date()): string {
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${now.getUTCFullYear()}/${month}/${randomUUID()}`;
}

function localDriver(root: string): StorageDriver {
  const resolve = (key: string) => {
    if (!KEY_PATTERN.test(key)) throw new Error(`Clave de almacenamiento inválida: ${key}`);
    return path.join(root, ...key.split("/"));
  };
  return {
    async put(key, data) {
      const target = resolve(key);
      await mkdir(path.dirname(target), { recursive: true });
      // Se escribe a un temporal y se renombra: nunca queda un archivo a medias.
      const temp = `${target}.partial`;
      await writeFile(temp, data, { flag: "wx" });
      await rename(temp, target);
    },
    async open(key) {
      const target = resolve(key);
      const { size } = await stat(target);
      return { stream: Readable.toWeb(createReadStream(target)) as ReadableStream<Uint8Array>, size };
    },
    async discard(key) {
      await rm(resolve(key), { force: true });
    },
  };
}

let driver: StorageDriver | undefined;

export function storage(): StorageDriver {
  driver ??= localDriver(path.resolve(env.STORAGE_DIR));
  return driver;
}

import "server-only";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { link, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { assertStorageKey, FileExistsError, FileTooLargeError, type StorageDriver } from "./common";

/** Disco local (un volumen persistente de Docker). */
export function localDriver(dir: string): StorageDriver {
  const root = path.resolve(dir);
  const resolve = (key: string) => {
    assertStorageKey(key);
    return path.join(root, ...key.split("/"));
  };
  return {
    async put(key, data) {
      const target = resolve(key);
      await mkdir(path.dirname(target), { recursive: true });
      // Se escribe a un temporal propio y se enlaza con el nombre final: nunca
      // queda un archivo a medias y nunca se pisa uno que ya estaba (dos
      // subidas a la vez de la misma clave: gana la primera).
      const temp = `${target}.${randomUUID()}.partial`;
      try {
        await writeFile(temp, data, { flag: "wx" });
        await link(temp, target).catch((error: NodeJS.ErrnoException) => {
          throw error.code === "EEXIST" ? new FileExistsError(key) : error;
        });
      } finally {
        await rm(temp, { force: true });
      }
    },
    async open(key) {
      const target = resolve(key);
      const { size } = await stat(target);
      return { stream: Readable.toWeb(createReadStream(target)) as ReadableStream<Uint8Array>, size };
    },
    async read(key, maxBytes) {
      const target = resolve(key);
      const info = await stat(target).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
      if (!info) return null;
      if (info.size > maxBytes) throw new FileTooLargeError(maxBytes);
      return new Uint8Array(await readFile(target));
    },
    async discard(key) {
      await rm(resolve(key), { force: true });
    },
    // El navegador sube a la propia aplicación (src/app/api/subidas/[id]/route.ts).
    async uploadTarget(upload) {
      return { url: `/api/subidas/${upload.id}`, headers: { "content-type": "application/octet-stream" } };
    },
  };
}

import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertStorageKey,
  FileExistsError,
  FileTooLargeError,
  newStorageKey,
  readLimited,
} from "@/server/storage/common";
import { localDriver } from "@/server/storage/local";

const blob = vi.hoisted(() => ({
  BlobNotFoundError: class BlobNotFoundError extends Error {},
  put: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
  issueSignedToken: vi.fn(),
  presignUrl: vi.fn(),
  parseStoreIdFromDelegationToken: vi.fn(),
}));
vi.mock("@vercel/blob", () => blob);

const { vercelBlobDriver } = await import("@/server/storage/vercel-blob");

/** Stream que entrega los pedazos de a uno. */
function streamOf(...chunks: number[][]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new Uint8Array(chunk));
      controller.close();
    },
  });
}

const KEY = newStorageKey(new Date("2026-10-24T12:00:00Z"));

describe("claves de almacenamiento", () => {
  it("son aleatorias, por año y mes, y no aceptan rutas", () => {
    expect(KEY).toMatch(/^2026\/10\/[0-9a-f-]{36}$/);
    expect(newStorageKey()).not.toBe(newStorageKey());
    expect(() => assertStorageKey(KEY)).not.toThrow();
    for (const key of ["../etc/passwd", `2026/10/${"a".repeat(36)}/../x`, "2026/10/archivo.pdf", ""]) {
      expect(() => assertStorageKey(key)).toThrow("Clave de almacenamiento inválida");
    }
  });
});

describe("readLimited", () => {
  it("junta los pedazos en orden", async () => {
    expect(Array.from(await readLimited(streamOf([1, 2], [3], [4, 5]), 5))).toEqual([1, 2, 3, 4, 5]);
    expect((await readLimited(streamOf(), 5)).byteLength).toBe(0);
  });

  it("corta apenas se pasa del máximo y cancela el stream", async () => {
    const cancel = vi.fn();
    let sent = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent++;
        controller.enqueue(new Uint8Array(4));
      },
      cancel,
    });
    await expect(readLimited(endless, 10)).rejects.toBeInstanceOf(FileTooLargeError);
    expect(cancel).toHaveBeenCalled();
    expect(sent).toBeLessThan(5);
  });
});

describe("disco local", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "rrhh-storage-"));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("guarda, lee, abre y descarta sin dejar temporales", async () => {
    const driver = localDriver(dir);
    const key = newStorageKey();
    await driver.put(key, new Uint8Array([1, 2, 3]));
    expect(Array.from((await driver.read(key, 3))!)).toEqual([1, 2, 3]);
    const opened = await driver.open(key);
    expect(opened.size).toBe(3);
    expect(Array.from(await readLimited(opened.stream, 3))).toEqual([1, 2, 3]);
    const [year, month] = key.split("/");
    expect(await readdir(path.join(dir, year!, month!))).toEqual([key.split("/")[2]]);
    await driver.discard(key);
    expect(await driver.read(key, 3)).toBeNull();
    await expect(driver.discard(key)).resolves.toBeUndefined();
  });

  it("no pisa un archivo que ya está", async () => {
    const driver = localDriver(dir);
    const key = newStorageKey();
    await driver.put(key, new Uint8Array([1]));
    await expect(driver.put(key, new Uint8Array([2]))).rejects.toBeInstanceOf(FileExistsError);
    expect(Array.from((await driver.read(key, 1))!)).toEqual([1]);
    const [year, month] = key.split("/");
    expect(await readdir(path.join(dir, year!, month!))).toEqual([key.split("/")[2]]);
    // Dos a la vez: solo una llega.
    const other = newStorageKey();
    const results = await Promise.allSettled([1, 2, 3].map((n) => driver.put(other, new Uint8Array([n]))));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected").map((r) => r.reason)).toEqual([
      expect.any(FileExistsError),
      expect.any(FileExistsError),
    ]);
  });

  it("rechaza lo que supera el máximo y las claves inválidas", async () => {
    const driver = localDriver(dir);
    const key = newStorageKey();
    await driver.put(key, new Uint8Array(11));
    await expect(driver.read(key, 10)).rejects.toBeInstanceOf(FileTooLargeError);
    await expect(driver.read("../afuera", 10)).rejects.toThrow("Clave de almacenamiento inválida");
  });

  it("el navegador sube a la ruta de la aplicación", async () => {
    const target = await localDriver(dir).uploadTarget({
      id: "0199a000-0000-7000-8000-000000000001",
      key: KEY,
      maxBytes: 10,
      expiresAt: new Date(),
    });
    expect(target).toEqual({
      url: "/api/subidas/0199a000-0000-7000-8000-000000000001",
      headers: { "content-type": "application/octet-stream" },
    });
  });
});

describe("Vercel Blob", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("guarda privado, sin sufijo y sin pisar", async () => {
    await vercelBlobDriver().put(KEY, new Uint8Array([1, 2]));
    expect(blob.put).toHaveBeenCalledWith(KEY, Buffer.from([1, 2]), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: "application/octet-stream",
    });
    await expect(vercelBlobDriver().put("x/../y", new Uint8Array())).rejects.toThrow("Clave");
    expect(blob.put).toHaveBeenCalledTimes(1);
  });

  it("lee del origen y respeta el máximo", async () => {
    const driver = vercelBlobDriver();
    blob.get.mockResolvedValueOnce({ statusCode: 200, stream: streamOf([7, 8]), blob: { size: 2 } });
    expect(Array.from((await driver.read(KEY, 2))!)).toEqual([7, 8]);
    expect(blob.get).toHaveBeenCalledWith(KEY, { access: "private", useCache: false });

    blob.get.mockResolvedValueOnce(null);
    expect(await driver.read(KEY, 2)).toBeNull();

    const cancel = vi.fn();
    const big = new ReadableStream<Uint8Array>({ cancel });
    blob.get.mockResolvedValueOnce({ statusCode: 200, stream: big, blob: { size: 3 } });
    await expect(driver.read(KEY, 2)).rejects.toBeInstanceOf(FileTooLargeError);
    expect(cancel).toHaveBeenCalled();

    // El tamaño informado puede no coincidir: el límite se controla también al leer.
    blob.get.mockResolvedValueOnce({ statusCode: 200, stream: streamOf([1, 2, 3]), blob: { size: 2 } });
    await expect(driver.read(KEY, 2)).rejects.toBeInstanceOf(FileTooLargeError);
  });

  it("abrir un archivo que no está es un error", async () => {
    blob.get.mockResolvedValueOnce(null);
    await expect(vercelBlobDriver().open(KEY)).rejects.toThrow("no está en el almacén");
    blob.get.mockResolvedValueOnce({ statusCode: 200, stream: streamOf([1]), blob: { size: 1 } });
    expect((await vercelBlobDriver().open(KEY)).size).toBe(1);
  });

  it("firma una subida de ese archivo, hasta el máximo y hasta que vence", async () => {
    const token = { delegationToken: "delegacion", clientSigningToken: "firma" };
    blob.issueSignedToken.mockResolvedValue(token);
    blob.presignUrl.mockResolvedValue({ presignedUrl: "https://vercel.com/api/blob/?pathname=x&firma" });
    blob.parseStoreIdFromDelegationToken.mockReturnValue("store_123");
    const expiresAt = new Date("2026-10-24T12:30:00Z");

    const target = await vercelBlobDriver().uploadTarget({ id: "id", key: KEY, maxBytes: 1000, expiresAt });

    expect(blob.issueSignedToken).toHaveBeenCalledWith({
      pathname: KEY,
      operations: ["put"],
      maximumSizeInBytes: 1000,
      validUntil: expiresAt.getTime(),
    });
    expect(blob.presignUrl).toHaveBeenCalledWith(token, {
      operation: "put",
      pathname: KEY,
      access: "private",
      maximumSizeInBytes: 1000,
      addRandomSuffix: false,
      allowOverwrite: false,
      validUntil: expiresAt.getTime(),
    });
    expect(blob.parseStoreIdFromDelegationToken).toHaveBeenCalledWith("delegacion");
    expect(target).toEqual({
      url: "https://vercel.com/api/blob/?pathname=x&firma",
      headers: {
        "content-type": "application/octet-stream",
        "x-content-type": "application/octet-stream",
        "x-vercel-blob-access": "private",
        "x-vercel-blob-store-id": "store_123",
        "x-api-version": "12",
      },
    });
  });

  it("descarta por clave, aunque nunca haya llegado", async () => {
    await vercelBlobDriver().discard(KEY);
    expect(blob.del).toHaveBeenCalledWith(KEY);
    blob.del.mockRejectedValueOnce(new blob.BlobNotFoundError("no está"));
    await expect(vercelBlobDriver().discard(KEY)).resolves.toBeUndefined();
    blob.del.mockRejectedValueOnce(new Error("sin conexión"));
    await expect(vercelBlobDriver().discard(KEY)).rejects.toThrow("sin conexión");
  });
});

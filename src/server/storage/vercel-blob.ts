import "server-only";
import { BlobNotFoundError, del, get, issueSignedToken, parseStoreIdFromDelegationToken, presignUrl, put } from "@vercel/blob";
import { assertStorageKey, readLimited, FileTooLargeError, type StorageDriver } from "./common";

/**
 * Almacén privado de Vercel Blob: ningún archivo se puede leer por su URL sin
 * credenciales. En Vercel el SDK se autentica solo (OIDC con `BLOB_STORE_ID`);
 * fuera de Vercel usa `BLOB_READ_WRITE_TOKEN`.
 */
export function vercelBlobDriver(): StorageDriver {
  return {
    async put(key, data) {
      assertStorageKey(key);
      await put(key, Buffer.from(data), {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: CONTENT_TYPE,
      });
    },
    async open(key) {
      assertStorageKey(key);
      const result = await get(key, { access: "private" });
      if (!result || result.statusCode !== 200 || !result.stream) {
        throw new Error(`El archivo ${key} no está en el almacén de Vercel Blob.`);
      }
      return { stream: result.stream, size: result.blob.size ?? 0 };
    },
    async read(key, maxBytes) {
      assertStorageKey(key);
      // Recién subido: se lee del origen y no de la caché, que puede no tenerlo todavía.
      const result = await get(key, { access: "private", useCache: false });
      if (!result || result.statusCode !== 200 || !result.stream) return null;
      if ((result.blob.size ?? 0) > maxBytes) {
        await result.stream.cancel();
        throw new FileTooLargeError(maxBytes);
      }
      return readLimited(result.stream, maxBytes);
    },
    async discard(key) {
      assertStorageKey(key);
      try {
        await del(key);
      } catch (error) {
        // Si nunca llegó a subirse, no hay nada que borrar.
        if (!(error instanceof BlobNotFoundError)) throw error;
      }
    },
    /**
     * URL firmada para que el navegador suba ese archivo y solo ese, hasta el
     * tamaño permitido, sin pisar otro y hasta que vence la subida. El tipo
     * real se valida después por el contenido, como en el disco local.
     */
    async uploadTarget(upload) {
      assertStorageKey(upload.key);
      const validUntil = upload.expiresAt.getTime();
      const token = await issueSignedToken({
        pathname: upload.key,
        operations: ["put"],
        maximumSizeInBytes: upload.maxBytes,
        validUntil,
      });
      const { presignedUrl } = await presignUrl(token, {
        operation: "put",
        pathname: upload.key,
        access: "private",
        maximumSizeInBytes: upload.maxBytes,
        addRandomSuffix: false,
        allowOverwrite: false,
        validUntil,
      });
      // Los mismos encabezados que manda el SDK de Vercel cuando sube con una URL firmada.
      return {
        url: presignedUrl,
        headers: {
          "content-type": CONTENT_TYPE,
          "x-content-type": CONTENT_TYPE,
          "x-vercel-blob-access": "private",
          "x-vercel-blob-store-id": parseStoreIdFromDelegationToken(token.delegationToken),
          "x-api-version": BLOB_API_VERSION,
        },
      };
    },
  };
}

/** El tipo se guarda en la base (reconocido por el contenido); en el almacén todos son binarios. */
const CONTENT_TYPE = "application/octet-stream";

/** Versión de la API de Vercel Blob que usa @vercel/blob 2.8. */
const BLOB_API_VERSION = "12";

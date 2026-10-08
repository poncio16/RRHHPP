import { inflateRawSync } from "node:zlib";

/*
 * Control previo de un .xlsx, que es un zip: suma lo que ocupa cada parte ya
 * descomprimida, cortando apenas pasa el tope. ExcelJS descomprime todo en
 * memoria sin límite, así que un archivo chico podría agotarla.
 */

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_FILE_HEADER = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;
const STORED = 0;
const DEFLATED = 8;

export type ZipCheck = "ok" | "too-large" | "invalid";

export function checkZipSize(bytes: Uint8Array, limit: number): ZipCheck {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === END_OF_CENTRAL_DIRECTORY) {
      end = i;
      break;
    }
  }
  if (end < 0) return "invalid";

  const entries = buf.readUInt16LE(end + 10);
  let entry = buf.readUInt32LE(end + 16);
  let total = 0;
  for (let n = 0; n < entries; n++) {
    if (entry + 46 > buf.length || buf.readUInt32LE(entry) !== CENTRAL_FILE_HEADER) return "invalid";
    const method = buf.readUInt16LE(entry + 10);
    const compressedSize = buf.readUInt32LE(entry + 20);
    const local = buf.readUInt32LE(entry + 42);
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== LOCAL_FILE_HEADER) return "invalid";
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + compressedSize);
    if (data.length !== compressedSize) return "invalid";

    if (method === STORED) total += compressedSize;
    else if (method === DEFLATED) {
      try {
        total += inflateRawSync(data, { maxOutputLength: Math.max(1, limit - total) }).length;
      } catch (error) {
        return (error as NodeJS.ErrnoException).code === "ERR_BUFFER_TOO_LARGE" ? "too-large" : "invalid";
      }
    } else return "invalid";
    if (total > limit) return "too-large";

    entry += 46 + buf.readUInt16LE(entry + 28) + buf.readUInt16LE(entry + 30) + buf.readUInt16LE(entry + 32);
  }
  return "ok";
}

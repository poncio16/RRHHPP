/**
 * Tipos de archivo aceptados como adjunto de un documento. El tipo se
 * reconoce por el contenido (firma de los primeros bytes), no por la
 * extensión ni por lo que informa el navegador.
 */
export const ALLOWED_FILE_TYPES = [
  { mime: "application/pdf", extension: "pdf", label: "PDF", signature: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  { mime: "image/png", extension: "png", label: "PNG", signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "image/jpeg", extension: "jpg", label: "JPG", signature: [0xff, 0xd8, 0xff] },
] as const;

export type AllowedFileType = (typeof ALLOWED_FILE_TYPES)[number];

/** Valor para el atributo `accept` del input de archivo. */
export const FILE_ACCEPT = ".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg";
export const FILE_TYPES_LABEL = ALLOWED_FILE_TYPES.map((t) => t.label).join(", ");

export function detectFileType(bytes: Uint8Array): AllowedFileType | null {
  return ALLOWED_FILE_TYPES.find((type) => type.signature.every((byte, i) => bytes[i] === byte)) ?? null;
}

/**
 * Nombre original saneado para mostrar y para la descarga: sin rutas, sin
 * caracteres de control y con la extensión del tipo real.
 */
export function safeFileName(original: string, type: AllowedFileType): string {
  const base =
    original
      .split(/[\\/]/)
      .pop()!
      .replace(/[\u0000-\u001f\u007f"<>|:*?]/g, "")
      .replace(/\.[^.]*$/, "")
      .replace(/^\.+/, "")
      .trim()
      .slice(0, 150) || "archivo";
  return `${base}.${type.extension}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

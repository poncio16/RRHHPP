import { createHash, randomBytes } from "node:crypto";

/** Token de sesión aleatorio de 256 bits. Solo viaja en la cookie. */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** En la base se guarda solo el hash: un volcado de la tabla no permite secuestrar sesiones. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

import "server-only";
import { hash, verify } from "@node-rs/argon2";
import { randomInt } from "node:crypto";
import { ARGON2_OPTIONS } from "./argon2-options";

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

// Hash de una contraseña aleatoria: se verifica contra él cuando el usuario no
// existe, para que la respuesta tarde lo mismo y no revele qué emails existen.
let dummyHash: Promise<string> | undefined;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(`dummy-${Date.now()}-${Math.random()}`);
  return dummyHash;
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** Contraseña temporal legible (sin caracteres ambiguos como 0/O o 1/l). */
export function generateTemporaryPassword(length = 14): string {
  return Array.from({ length }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}

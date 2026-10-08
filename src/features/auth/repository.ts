import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";

type Client = Prisma.TransactionClient | typeof db;

export function findUserByEmail(email: string) {
  return db.user.findUnique({ where: { email } });
}

export function findUserById(id: string) {
  return db.user.findUnique({ where: { id } });
}

export function updateUser(id: string, data: Prisma.UserUncheckedUpdateInput, client: Client = db) {
  return client.user.update({ where: { id }, data });
}

/**
 * Suma un intento de ingreso en una sola sentencia y devuelve el total, para
 * que varios pedidos simultáneos no lean el mismo contador y se pisen.
 */
export async function addLoginAttempt(id: string): Promise<number> {
  const { failedLoginCount } = await db.user.update({
    where: { id },
    data: { failedLoginCount: { increment: 1 } },
    select: { failedLoginCount: true },
  });
  return failedLoginCount;
}

/**
 * Al vencer un bloqueo, vuelve el contador a cero. Si llegan varios pedidos
 * juntos, solo el primero lo hace: los demás ya no encuentran ese bloqueo.
 */
export function clearExpiredLock(id: string, lockedUntil: Date) {
  return db.user.updateMany({ where: { id, lockedUntil }, data: { failedLoginCount: 0, lockedUntil: null } });
}

export function transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) {
  return db.$transaction(fn);
}

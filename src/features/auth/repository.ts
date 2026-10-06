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

export function transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) {
  return db.$transaction(fn);
}

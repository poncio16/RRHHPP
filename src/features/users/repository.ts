import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import type { UserListQuery } from "./schemas";

const listSelect = {
  id: true,
  name: true,
  email: true,
  isActive: true,
  lockedUntil: true,
  lastLoginAt: true,
  mustChangePassword: true,
  role: { select: { id: true, code: true, name: true } },
} satisfies Prisma.UserSelect;

export type UserListItem = Prisma.UserGetPayload<{ select: typeof listSelect }>;

export async function listUsers(query: UserListQuery) {
  const where: Prisma.UserWhereInput = {
    ...(query.status === "activos" ? { isActive: true } : query.status === "inactivos" ? { isActive: false } : {}),
    ...(query.roleId ? { roleId: query.roleId } : {}),
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: "insensitive" } },
            { email: { contains: query.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    db.user.findMany({
      where,
      select: listSelect,
      orderBy: [{ name: "asc" }, { email: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.user.count({ where }),
  ]);
  return { items, total };
}

export function findUserDetail(id: string) {
  return db.user.findUnique({
    where: { id },
    select: {
      ...listSelect,
      createdAt: true,
      failedLoginCount: true,
      sessions: {
        where: { revokedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true, createdAt: true, lastSeenAt: true, ip: true, userAgent: true },
        orderBy: { lastSeenAt: "desc" },
      },
    },
  });
}

export type UserDetail = NonNullable<Awaited<ReturnType<typeof findUserDetail>>>;

export function listRolesForSelect() {
  return db.role.findMany({ select: { id: true, name: true, code: true }, orderBy: { name: "asc" } });
}

/** Administradores activos, sin contar al usuario indicado. */
export function countOtherActiveAdmins(tx: Prisma.TransactionClient, excludeUserId: string, adminRoleCode: string) {
  return tx.user.count({ where: { isActive: true, role: { code: adminRoleCode }, id: { not: excludeUserId } } });
}

type Client = Prisma.TransactionClient | typeof db;

export function findUserById(id: string, client: Client = db) {
  return client.user.findUnique({ where: { id }, include: { role: { select: { code: true, name: true } } } });
}

export function findRoleById(id: string, client: Client = db) {
  return client.role.findUnique({ where: { id }, select: { id: true, code: true, name: true } });
}

export function insertUser(data: Prisma.UserUncheckedCreateInput, client: Client = db) {
  return client.user.create({ data });
}

export function updateUserById(id: string, data: Prisma.UserUncheckedUpdateInput, client: Client = db) {
  return client.user.update({ where: { id }, data });
}

export function transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) {
  return db.$transaction(fn);
}

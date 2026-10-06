import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";

export function listRolesWithPermissions() {
  return db.role.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      isSystem: true,
      permissions: { select: { permission: true } },
      _count: { select: { users: { where: { isActive: true } } } },
    },
  });
}

export function findRole(id: string, tx: Prisma.TransactionClient) {
  return tx.role.findUnique({ where: { id }, include: { permissions: true } });
}

export async function replaceRolePermissions(roleId: string, permissions: string[], tx: Prisma.TransactionClient) {
  await tx.rolePermission.deleteMany({ where: { roleId } });
  if (permissions.length > 0) {
    await tx.rolePermission.createMany({ data: permissions.map((permission) => ({ roleId, permission })) });
  }
}

export function transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) {
  return db.$transaction(fn);
}

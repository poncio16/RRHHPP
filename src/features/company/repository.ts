import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";

const companySelect = {
  id: true,
  legalName: true,
  tradeName: true,
  cuit: true,
  addressLine: true,
  city: true,
  provinceId: true,
  postalCode: true,
  defaultArtProviderId: true,
  defaultWorkplaceId: true,
} satisfies Prisma.CompanySelect;

export type CompanyRecord = Prisma.CompanyGetPayload<{ select: typeof companySelect }>;

/** La empresa es una sola fila (ver docs/arquitectura.md, D9). */
export async function findCompany(client: Prisma.TransactionClient | typeof db = db) {
  return client.company.findFirst({ select: companySelect, orderBy: { createdAt: "asc" } });
}

export async function createCompany(data: Prisma.CompanyUncheckedCreateInput, tx: Prisma.TransactionClient) {
  return tx.company.create({ data, select: companySelect });
}

export async function updateCompany(
  id: string,
  data: Prisma.CompanyUncheckedUpdateInput,
  tx: Prisma.TransactionClient,
) {
  return tx.company.update({ where: { id }, data, select: companySelect });
}

export function transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return db.$transaction(fn);
}

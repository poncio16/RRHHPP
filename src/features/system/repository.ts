import "server-only";
import { db } from "@/server/db";

export async function pingDatabase(): Promise<void> {
  await db.$queryRaw`SELECT 1`;
}

export async function countAppliedMigrations(): Promise<number> {
  const rows = await db.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
  return Number(rows[0]?.count ?? 0);
}

export async function countReferenceData() {
  const [provinces, lookupValues] = await Promise.all([db.province.count(), db.lookupValue.count()]);
  return { provinces, lookupValues };
}

export async function findCompanyName(): Promise<string | null> {
  const company = await db.company.findFirst({ select: { legalName: true, tradeName: true } });
  return company ? (company.tradeName ?? company.legalName) : null;
}

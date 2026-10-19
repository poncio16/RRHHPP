import "server-only";
import type { BackupRunKind } from "@/generated/prisma/client";
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

/* ----------------------------------------------------------------------------
 * Puesta en marcha
 * ------------------------------------------------------------------------- */

export async function companyExists(): Promise<boolean> {
  return (await db.company.count()) > 0;
}

export async function activeCatalogCounts() {
  const where = { isActive: true };
  const [departments, positions, workplaces, schedules] = await Promise.all([
    db.department.count({ where }),
    db.position.count({ where }),
    db.workplace.count({ where }),
    db.workSchedule.count({ where }),
  ]);
  return { departments, positions, workplaces, schedules };
}

export async function holidaysInYear(year: number) {
  return db.holiday.count({
    where: { date: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } },
  });
}

export async function activeUsersWithRole(roleCode: string) {
  return db.user.count({ where: { isActive: true, role: { code: roleCode } } });
}

export async function employeesCount() {
  return db.employee.count();
}

/* ----------------------------------------------------------------------------
 * Backups
 * ------------------------------------------------------------------------- */

/** La migración que crea `backup_run`: desde que se aplica, los scripts registran cada backup. */
export const BACKUP_RUN_MIGRATION = "20261019000000_backup_run";

/** Desde cuándo se registran los backups (al instalar o al actualizar a esta versión). */
export async function backupTrackingSince(): Promise<Date | null> {
  const rows = await db.$queryRaw<{ finished_at: Date | null }[]>`
    SELECT finished_at FROM _prisma_migrations
    WHERE migration_name = ${BACKUP_RUN_MIGRATION} AND finished_at IS NOT NULL AND rolled_back_at IS NULL
    ORDER BY finished_at LIMIT 1`;
  return rows[0]?.finished_at ?? null;
}

/** El último registro de ese tipo y el último correcto. */
export async function latestBackupRuns(kind: BackupRunKind) {
  const select = { finishedAt: true, ok: true, name: true, detail: true } as const;
  const orderBy = [{ finishedAt: "desc" }, { id: "desc" }] as const;
  const [last, lastOk] = await Promise.all([
    db.backupRun.findFirst({ where: { kind }, orderBy: [...orderBy], select }),
    db.backupRun.findFirst({ where: { kind, ok: true }, orderBy: [...orderBy], select }),
  ]);
  return { last, lastOk };
}

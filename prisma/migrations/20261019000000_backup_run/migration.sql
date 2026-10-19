-- Resultado de cada backup y de cada prueba de restauración, para el aviso del
-- inicio. Lo insertan scripts/backup.sh y scripts/restore-test.sh; la fecha en
-- que se aplica esta migración marca desde cuándo se registran.
-- CreateEnum
CREATE TYPE "BackupRunKind" AS ENUM ('BACKUP', 'PRUEBA_RESTAURACION');

-- CreateTable
CREATE TABLE "backup_run" (
    "id" UUID NOT NULL,
    "kind" "BackupRunKind" NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "name" TEXT,
    "detail" TEXT,
    "finished_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backup_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "backup_run_kind_finished_at_idx" ON "backup_run"("kind", "finished_at");

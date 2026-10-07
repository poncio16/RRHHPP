-- Fase 9: remuneraciones y novedades.

-- CreateEnum
CREATE TYPE "NoveltyOrigin" AS ENUM ('HORAS_EXTRAS', 'LLEGADAS_TARDE', 'AUSENCIAS', 'CAMBIO_SALARIAL', 'CAMBIO_CATEGORIA');

-- DropIndex
DROP INDEX "novelty_source_type_source_id_idx";

-- AlterTable
ALTER TABLE "novelty_type" ADD COLUMN     "generated_from" "NoveltyOrigin";

-- CreateIndex
CREATE UNIQUE INDEX "novelty_source_period_key" ON "novelty"("source_type", "source_id", "period");

-- CreateIndex
CREATE UNIQUE INDEX "novelty_type_generated_from_key" ON "novelty_type"("generated_from");


-- Restricciones que Prisma no modela.
ALTER TABLE "payroll_record_line"
  ADD CONSTRAINT "payroll_record_line_amount_non_negative" CHECK ("amount" >= 0),
  ADD CONSTRAINT "payroll_record_line_quantity_positive" CHECK ("quantity" IS NULL OR "quantity" > 0);

-- Una novedad generada tiene tipo y id de origen; una manual, ninguno.
ALTER TABLE "novelty"
  ADD CONSTRAINT "novelty_source_pair" CHECK (("source_type" IS NULL) = ("source_id" IS NULL));

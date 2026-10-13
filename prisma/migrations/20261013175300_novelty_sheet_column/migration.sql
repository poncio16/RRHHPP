-- Planilla de novedades para el contador: cada tipo de novedad puede ser una
-- columna, en el orden de sheet_column.
-- AlterTable
ALTER TABLE "novelty_type" ADD COLUMN     "sheet_column" INTEGER;

-- Columnas iniciales con los tipos del seed base, si existen con ese nombre;
-- después se cambian en Configuración → Tipos de novedad.
UPDATE "novelty_type" SET "sheet_column" = 1 WHERE "name" = 'Ausencia';
UPDATE "novelty_type" SET "sheet_column" = 2 WHERE "name" = 'Horas extras';
UPDATE "novelty_type" SET "sheet_column" = 4 WHERE "name" = 'Adelanto';

-- Instalaciones existentes: tipo de novedad Vacaciones (columna 3) generado por
-- el tipo de licencia Vacaciones, solo si esa licencia todavía no genera otra
-- novedad y no hay un tipo con ese nombre. En una base nueva no hay tipos de
-- licencia todavía: lo crea el seed base.
WITH "created" AS (
  INSERT INTO "novelty_type" ("id", "name", "nature", "requires_quantity", "quantity_unit", "sheet_column", "sort_order", "updated_at")
  SELECT gen_random_uuid(), 'Vacaciones', 'INFORMATIVO', true, 'días', 3,
         COALESCE((SELECT MAX("sort_order") + 1 FROM "novelty_type"), 0), now()
  WHERE EXISTS (SELECT 1 FROM "leave_type" WHERE "name" = 'Vacaciones' AND "generates_novelty_type_id" IS NULL)
    AND NOT EXISTS (SELECT 1 FROM "novelty_type" WHERE "name" = 'Vacaciones')
  RETURNING "id"
)
UPDATE "leave_type"
SET "generates_novelty_type_id" = (SELECT "id" FROM "created"), "updated_at" = now()
WHERE "name" = 'Vacaciones' AND "generates_novelty_type_id" IS NULL AND EXISTS (SELECT 1 FROM "created");

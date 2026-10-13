-- Planilla de novedades para el contador: cada tipo de novedad puede ser una
-- columna, en el orden de sheet_column.
-- AlterTable
ALTER TABLE "novelty_type" ADD COLUMN     "sheet_column" INTEGER;

-- Columnas iniciales con los tipos del seed base, si existen con ese nombre;
-- después se cambian en Configuración → Tipos de novedad.
UPDATE "novelty_type" SET "sheet_column" = 1 WHERE "name" = 'Ausencia';
UPDATE "novelty_type" SET "sheet_column" = 2 WHERE "name" = 'Horas extras';
UPDATE "novelty_type" SET "sheet_column" = 4 WHERE "name" = 'Adelanto';

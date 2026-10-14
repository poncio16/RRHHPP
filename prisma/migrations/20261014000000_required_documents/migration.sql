-- Documentos obligatorios: cada tipo de documento puede ser obligatorio en
-- todo legajo activo una vez (DNI) o todos los meses (recibos de sueldo, desde
-- un mes que elige la empresa), y cada documento mensual lleva su mes.
-- CreateEnum
CREATE TYPE "DocumentRequirement" AS ENUM ('UNA_VEZ', 'MENSUAL');

-- AlterTable
ALTER TABLE "document" ADD COLUMN     "period" DATE;

-- AlterTable
ALTER TABLE "document_type" ADD COLUMN     "required_from" DATE,
ADD COLUMN     "requirement" "DocumentRequirement";

-- En las instalaciones que ya tienen tipos de documento (las nuevas los crea
-- el seed) se aplica lo que pidió la empresa; después se cambia en
-- Configuración → Tipos de documento. Los nombres se comparan sin distinguir
-- mayúsculas, como en el catálogo.
-- "Alta laboral" pasa a llamarse como la nombra la empresa: los documentos ya
-- cargados con ese tipo siguen contando.
UPDATE "document_type" SET "name" = 'Alta temprana firmada', "updated_at" = now()
WHERE lower("name") = 'alta laboral'
  AND NOT EXISTS (SELECT 1 FROM "document_type" WHERE lower("name") = 'alta temprana firmada');

INSERT INTO "document_type" ("id", "name", "sort_order", "updated_at")
SELECT gen_random_uuid(), t."name", COALESCE((SELECT MAX("sort_order") FROM "document_type"), 0) + t."position", now()
FROM (VALUES
  ('Alta temprana firmada', 1),
  ('Formulario de EPP', 2),
  ('Apercibimiento', 3),
  ('Recibo de sueldo', 4)
) AS t("name", "position")
WHERE EXISTS (SELECT 1 FROM "document_type")
  AND NOT EXISTS (SELECT 1 FROM "document_type" d WHERE lower(d."name") = lower(t."name"))
ON CONFLICT ("name") DO NOTHING;

UPDATE "document_type" SET "requirement" = 'UNA_VEZ', "updated_at" = now()
WHERE lower("name") IN ('dni', 'constancia de cuil', 'alta temprana firmada', 'formulario de epp');

-- Los recibos se controlan desde el mes en curso: los anteriores no se reclaman.
UPDATE "document_type"
SET "requirement" = 'MENSUAL',
    "required_from" = date_trunc('month', now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
    "updated_at" = now()
WHERE lower("name") = 'recibo de sueldo';

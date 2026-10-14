-- Documentos obligatorios: cada tipo de documento puede ser obligatorio en
-- todo legajo activo, y el sistema avisa en cuáles falta.
-- AlterTable
ALTER TABLE "document_type" ADD COLUMN     "is_required" BOOLEAN NOT NULL DEFAULT false;

-- En las instalaciones que ya tienen tipos de documento (las nuevas los crea
-- el seed): marca los obligatorios que pidió la empresa y agrega los tipos que
-- faltan. Después se cambian en Configuración → Tipos de documento.
UPDATE "document_type" SET "is_required" = true, "updated_at" = now()
WHERE "name" IN ('DNI', 'Constancia de CUIL');

INSERT INTO "document_type" ("id", "name", "is_required", "sort_order", "updated_at")
SELECT gen_random_uuid(), t."name", t."is_required", COALESCE((SELECT MAX("sort_order") FROM "document_type"), 0) + t."position", now()
FROM (VALUES
  ('Alta temprana firmada', true, 1),
  ('Formulario de EPP', true, 2),
  ('Apercibimiento', false, 3),
  ('Recibo de sueldo', false, 4)
) AS t("name", "is_required", "position")
WHERE EXISTS (SELECT 1 FROM "document_type")
ON CONFLICT ("name") DO NOTHING;

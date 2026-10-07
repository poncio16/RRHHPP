-- Orden alfabético en español para los nombres que se listan, sin depender de
-- la configuración regional del servidor (con "C" quedaba "BBVA" antes que
-- "Banco" y "Área" después de "Zona"). Prisma no modela la intercalación de
-- columnas, así que no aparece en schema.prisma ni genera diferencias.

ALTER TABLE "province" ALTER COLUMN "name" TYPE TEXT COLLATE "es-AR-x-icu";
ALTER TABLE "lookup_value" ALTER COLUMN "label" TYPE TEXT COLLATE "es-AR-x-icu";
ALTER TABLE "department" ALTER COLUMN "name" TYPE TEXT COLLATE "es-AR-x-icu";
ALTER TABLE "position" ALTER COLUMN "name" TYPE TEXT COLLATE "es-AR-x-icu";
ALTER TABLE "collective_agreement" ALTER COLUMN "name" TYPE TEXT COLLATE "es-AR-x-icu";
ALTER TABLE "category" ALTER COLUMN "name" TYPE TEXT COLLATE "es-AR-x-icu";
ALTER TABLE "workplace" ALTER COLUMN "name" TYPE TEXT COLLATE "es-AR-x-icu";
ALTER TABLE "contract_type" ALTER COLUMN "name" TYPE TEXT COLLATE "es-AR-x-icu";
ALTER TABLE "workday_type" ALTER COLUMN "name" TYPE TEXT COLLATE "es-AR-x-icu";
ALTER TABLE "work_schedule" ALTER COLUMN "name" TYPE TEXT COLLATE "es-AR-x-icu";
ALTER TABLE "health_insurer" ALTER COLUMN "name" TYPE TEXT COLLATE "es-AR-x-icu";
ALTER TABLE "art_provider" ALTER COLUMN "name" TYPE TEXT COLLATE "es-AR-x-icu";
ALTER TABLE "bank" ALTER COLUMN "name" TYPE TEXT COLLATE "es-AR-x-icu";
ALTER TABLE "user" ALTER COLUMN "name" TYPE TEXT COLLATE "es-AR-x-icu";

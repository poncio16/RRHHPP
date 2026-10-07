-- Búsqueda de empleados por nombre sin distinguir mayúsculas ni acentos
-- ("perez" encuentra "Pérez"), con índice trigram para que siga siendo rápida
-- con miles de legajos. unaccent() no es IMMUTABLE, así que se envuelve en una
-- función que sí lo es para poder indexarla. Prisma no modela índices por
-- expresión ni intercalaciones: no aparecen en schema.prisma.

CREATE OR REPLACE FUNCTION immutable_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

CREATE INDEX "employee_name_search_idx" ON "employee"
  USING gin (immutable_unaccent(lower("last_name" || ' ' || "first_name")) gin_trgm_ops);

-- Orden alfabético en español para apellido y nombre (ver 20261007000000_spanish_collation).
ALTER TABLE "employee" ALTER COLUMN "last_name" TYPE TEXT COLLATE "es-AR-x-icu";
ALTER TABLE "employee" ALTER COLUMN "first_name" TYPE TEXT COLLATE "es-AR-x-icu";

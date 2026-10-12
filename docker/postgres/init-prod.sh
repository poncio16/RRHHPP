#!/bin/sh
# Producción: se ejecuta una sola vez, al crear el volumen de la base.
# Crea el usuario de la aplicación (sin permisos de superusuario) y su base.
# Las extensiones que usan las migraciones (pg_trgm, unaccent) son "trusted":
# las puede instalar el dueño de la base.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v app_user="$APP_DB_USER" -v app_password="$APP_DB_PASSWORD" -v app_db="$APP_DB_NAME" <<'SQL'
CREATE ROLE :"app_user" LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE DATABASE :"app_db" OWNER :"app_user";
SQL

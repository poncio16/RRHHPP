#!/usr/bin/env bash
# Restaura un backup de scripts/backup.sh en la instalación de producción.
#
# Uso (en la carpeta del proyecto, con el .env de producción):
#   scripts/restore.sh <carpeta-del-backup>
#
# REEMPLAZA la base de datos de la aplicación por la del backup. Los archivos
# del backup se agregan a los adjuntos: cada archivo tiene un nombre único, así
# que no se pisa ni se borra ninguno. La aplicación queda detenida mientras
# dura y al final se aplican las migraciones pendientes (por si el backup es de
# una versión anterior). Todas las sesiones quedan cerradas. Antes de usarlo
# en serio, probalo con scripts/restore-test.sh. Ver docs/operacion.md.
#
# Para no preguntar (por ejemplo, en una prueba automatizada): RESTORE_CONFIRM=RESTAURAR.
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
# shellcheck source=scripts/lib.sh
source scripts/lib.sh

SRC="${1:-}"
if [ -z "$SRC" ] || [ ! -f "$SRC/base.dump" ] || [ ! -f "$SRC/archivos.tar.gz" ] || [ ! -f "$SRC/SHA256SUMS" ]; then
  echo "Uso: scripts/restore.sh <carpeta-del-backup> (con base.dump, archivos.tar.gz y SHA256SUMS)." >&2
  exit 1
fi

echo "Verificando el backup..."
(cd "$SRC" && sha256sum --quiet -c SHA256SUMS)

if [ "${RESTORE_CONFIRM:-}" != "RESTAURAR" ]; then
  echo "Se va a REEMPLAZAR la base de datos de la aplicación por la del backup $(basename "$SRC")."
  echo "Lo que se cargó después de ese backup se pierde."
  read -r -p "Escribí RESTAURAR para continuar: " answer
  if [ "$answer" != "RESTAURAR" ]; then
    echo "Cancelado: no se cambió nada."
    exit 1
  fi
fi

echo "Deteniendo la aplicación..."
docker compose stop app
docker compose up -d --wait db

echo "Recreando la base de datos..."
docker compose exec -T -e PGOPTIONS='-c client_min_messages=warning' db sh -c \
  'dropdb -U postgres --force --if-exists "$APP_DB_NAME" && createdb -U postgres -O "$APP_DB_USER" "$APP_DB_NAME"'

echo "Restaurando la base de datos..."
# Todo queda a nombre del usuario de la aplicación, aunque el backup venga de
# una instalación con otro nombre de usuario.
docker compose exec -T db sh -c \
  'pg_restore -U postgres -d "$APP_DB_NAME" --no-owner --role="$APP_DB_USER" --exit-on-error' <"$SRC/base.dump"
# Las sesiones abiertas en el momento del backup vuelven con él: se cierran
# todas y cada usuario vuelve a ingresar.
docker compose exec -T db sh -c \
  'psql -U postgres -d "$APP_DB_NAME" -v ON_ERROR_STOP=1 -q -c "UPDATE session SET revoked_at = now() WHERE revoked_at IS NULL"'

echo "Restaurando los archivos adjuntos..."
compose_run --entrypoint tar app -C /data/storage -xzf - <"$SRC/archivos.tar.gz"

echo "Aplicando migraciones pendientes y levantando la aplicación..."
docker compose up -d --wait app

echo "Restauración completa desde $(basename "$SRC")."

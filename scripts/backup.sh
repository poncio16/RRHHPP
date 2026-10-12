#!/usr/bin/env bash
# Backup de producción: base de datos (pg_dump) y archivos adjuntos.
#
# Uso (en la carpeta del proyecto, con el .env de producción):
#   scripts/backup.sh [carpeta-destino]
#
# Crea <destino>/rrhh-AAAAMMDDTHHMMSSZ/ con:
#   base.dump          formato custom de pg_dump (se restaura con scripts/restore.sh)
#   archivos.tar.gz    contenido de STORAGE_DIR
#   SHA256SUMS         sumas para verificar la copia
# y borra las carpetas de backup más viejas que BACKUP_RETENTION_DAYS (30 por defecto).
#
# Primero la base y después los archivos: un archivo se guarda en disco antes
# que su registro, así que todo lo que figura en el dump queda en el tar.
# Ver docs/operacion.md.
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."

# shellcheck source=scripts/lib.sh
source scripts/lib.sh
DEST="${1:-$(backup_dir)}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-$(env_value BACKUP_RETENTION_DAYS)}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
case "$RETENTION_DAYS" in
  '' | *[!0-9]*) echo "BACKUP_RETENTION_DAYS tiene que ser un número de días." >&2; exit 1 ;;
esac

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$DEST"
WORK="$(mktemp -d "$DEST/.en-curso-$STAMP.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

echo "Copiando la base de datos..."
docker compose exec -T db sh -c 'pg_dump -U postgres -d "$APP_DB_NAME" --format=custom' >"$WORK/base.dump"
# Que el dump se pueda leer entero antes de darlo por bueno.
docker compose exec -T db pg_restore --list <"$WORK/base.dump" >/dev/null

echo "Copiando los archivos adjuntos..."
compose_run --entrypoint tar app -C /data/storage --exclude='*.partial' -czf - . >"$WORK/archivos.tar.gz"
gzip -t "$WORK/archivos.tar.gz"

(cd "$WORK" && sha256sum base.dump archivos.tar.gz >SHA256SUMS)
mv "$WORK" "$DEST/rrhh-$STAMP"
trap - EXIT

find "$DEST" -mindepth 1 -maxdepth 1 -type d -name 'rrhh-*' -mtime +"$RETENTION_DAYS" -exec rm -rf {} +
# Restos de un backup interrumpido.
find "$DEST" -mindepth 1 -maxdepth 1 -type d -name '.en-curso-*' -mtime +1 -exec rm -rf {} +

echo "Backup completo: $DEST/rrhh-$STAMP ($(du -sh "$DEST/rrhh-$STAMP" | cut -f1))"

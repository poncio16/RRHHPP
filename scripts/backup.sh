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
#
# Al terminar, bien o mal, lo registra en la base (tabla backup_run) para el
# aviso del inicio de la aplicación.
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."

# shellcheck source=scripts/lib.sh
source scripts/lib.sh

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
NAME="rrhh-$STAMP"
WORK=""
STEP="al preparar el backup"
finish() {
  local status=$?
  if [ -n "$WORK" ]; then rm -rf "$WORK"; fi
  if [ "$status" -ne 0 ]; then
    echo "Backup FALLIDO: error $STEP." >&2
    # La carpeta, solo si el backup llegó a guardarse.
    local saved=""
    if [ -n "${DEST:-}" ] && [ -d "$DEST/$NAME" ]; then saved="$NAME"; fi
    record_run BACKUP false "$saved" "Error $STEP."
  fi
}
trap finish EXIT

DEST="${1:-$(backup_dir)}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-$(env_value BACKUP_RETENTION_DAYS)}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
case "$RETENTION_DAYS" in
  '' | *[!0-9]*) STEP="en BACKUP_RETENTION_DAYS, que tiene que ser un número de días"; exit 1 ;;
esac

STEP="al crear la carpeta en $DEST"
mkdir -p "$DEST"
WORK="$(mktemp -d "$DEST/.en-curso-$STAMP.XXXXXX")"

STEP="al copiar la base de datos"
echo "Copiando la base de datos..."
docker compose exec -T db sh -c 'pg_dump -U postgres -d "$APP_DB_NAME" --format=custom' >"$WORK/base.dump"
# Que el dump se pueda leer entero antes de darlo por bueno.
docker compose exec -T db pg_restore --list <"$WORK/base.dump" >/dev/null

STEP="al copiar los archivos adjuntos"
echo "Copiando los archivos adjuntos..."
compose_run --entrypoint tar app -C /data/storage --exclude='*.partial' -czf - . >"$WORK/archivos.tar.gz"
gzip -t "$WORK/archivos.tar.gz"

STEP="al guardar el backup en $DEST"
(cd "$WORK" && sha256sum base.dump archivos.tar.gz >SHA256SUMS)
mv "$WORK" "$DEST/$NAME"
WORK=""

STEP="al borrar los backups de más de $RETENTION_DAYS días (el backup nuevo quedó guardado)"
find "$DEST" -mindepth 1 -maxdepth 1 -type d -name 'rrhh-*' -mtime +"$RETENTION_DAYS" -exec rm -rf {} +
# Restos de un backup interrumpido.
find "$DEST" -mindepth 1 -maxdepth 1 -type d -name '.en-curso-*' -mtime +1 -exec rm -rf {} +

SIZE="$(du -sh "$DEST/$NAME" | cut -f1)"
record_run BACKUP true "$NAME" "$SIZE"
echo "Backup completo: $DEST/$NAME ($SIZE)"

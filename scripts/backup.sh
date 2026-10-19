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
# Al terminar, bien o mal (también si se interrumpe), registra el resultado en
# la base (tabla backup_run) para el aviso del inicio de la aplicación.
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."

# shellcheck source=scripts/lib.sh
source scripts/lib.sh

case "${1:-}" in
  -h | --help) echo "Uso: scripts/backup.sh [carpeta-destino]. Ver docs/operacion.md, sección 6."; exit 0 ;;
  -*) echo "Uso: scripts/backup.sh [carpeta-destino]" >&2; exit 2 ;;
esac

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
NAME="rrhh-$STAMP"
WORK=""
STEP="al preparar el backup"
INTERRUPTED=""
DONE=""
finish() {
  local status=$?
  # Que un error acá (por ejemplo, la terminal ya cerrada) no impida el registro.
  set +e
  trap '' HUP INT TERM
  if [ -n "$WORK" ]; then rm -rf "$WORK"; fi
  if [ "$status" -ne 0 ] && [ -z "$DONE" ]; then
    local reason="error $STEP"
    if [ -n "$INTERRUPTED" ]; then reason="se interrumpió $STEP"; fi
    if [ -n "${DEST:-}" ] && [ -d "$DEST/$NAME" ]; then
      # La carpeta existe recién después del `mv`: el backup quedó completo.
      echo "AVISO: $reason; el backup $DEST/$NAME quedó completo." >&2
      record_run BACKUP true "$NAME" "${reason^} (el backup quedó completo)."
    else
      echo "Backup FALLIDO: $reason." >&2
      record_run BACKUP false "" "${reason^}."
    fi
  fi
}
trap finish EXIT
trap 'INTERRUPTED=1; exit 129' HUP
trap 'INTERRUPTED=1; exit 130' INT
trap 'INTERRUPTED=1; exit 143' TERM

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

# Desde acá el backup está completo: si falla borrar los viejos, se avisa en el
# log y en el registro, sin darlo por fallido.
STEP="al borrar los backups viejos"
NOTE=""
if ! find "$DEST" -mindepth 1 -maxdepth 1 -type d -name 'rrhh-*' -mtime +"$RETENTION_DAYS" -exec rm -rf {} +; then
  NOTE="no se pudieron borrar los backups de más de $RETENTION_DAYS días"
fi
# Restos de un backup interrumpido.
if ! find "$DEST" -mindepth 1 -maxdepth 1 -type d -name '.en-curso-*' -mtime +1 -exec rm -rf {} +; then
  if [ -n "$NOTE" ]; then NOTE="$NOTE ni"; else NOTE="no se pudieron borrar"; fi
  NOTE="$NOTE los restos de backups interrumpidos"
fi
if [ -n "$NOTE" ]; then
  NOTE="$NOTE: revisá los permisos de $DEST"
  echo "AVISO: $NOTE." >&2
fi

STEP="al medir el backup"
SIZE="$(human_size "$DEST/$NAME")"
DONE=1
record_run BACKUP true "$NAME" "Tamaño: $SIZE.${NOTE:+ ${NOTE^}.}"
echo "Backup completo: $DEST/$NAME ($SIZE)"

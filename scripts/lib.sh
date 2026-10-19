# Funciones comunes de los scripts de operación (se incluye con `source`).
# Los scripts se ejecutan desde la carpeta del proyecto, junto al .env de producción.

# Valor de una variable del .env (sin comillas), o vacío si no está.
env_value() {
  [ -f .env ] || return 0
  sed -n "s/^$1=//p" .env | tail -n 1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}

# Carpeta de backups: variable de entorno BACKUP_DIR, la del .env o ./backups.
backup_dir() {
  local dir="${BACKUP_DIR:-$(env_value BACKUP_DIR)}"
  echo "${dir:-./backups}"
}

# Corre SQL en la base indicada como superusuario, sin encabezados.
psql_at() {
  docker compose exec -T db psql -U postgres -d "$1" -v ON_ERROR_STOP=1 -At -c "$2"
}

# Comando de una sola vez en un contenedor nuevo del servicio indicado, sin
# levantar sus dependencias ni mostrar el progreso de Compose.
compose_run() {
  docker compose --progress quiet run --rm --no-deps -T "$@"
}

# 15230 → "15.230".
thousands() {
  echo "$1" | awk '{ n = $1; s = ""; while (n >= 1000) { s = sprintf(".%03d%s", n % 1000, s); n = int(n / 1000) } print n s }'
}

# "1 archivo" / "3 archivos" / "15.230 filas".
plural() {
  if [ "$1" -eq 1 ]; then echo "1 $2"; else echo "$(thousands "$1") $3"; fi
}

# Tamaño de una carpeta para leer: "136 KB", "48,3 MB", "1,2 GB".
human_size() {
  LC_ALL=C du -sk "$1" | awk '{
    kb = $1
    if (kb < 1024) printf "%d KB", kb
    else if (kb < 1048576) printf "%.1f MB", kb / 1024
    else printf "%.1f GB", kb / 1048576
  }' | tr . ,
}

# Registra en la base de la aplicación el resultado de un backup o de una
# prueba de restauración, para el aviso del inicio (tabla backup_run).
#   record_run BACKUP|PRUEBA_RESTAURACION true|false <carpeta> <detalle>
# Si no puede (por ejemplo, con la base detenida), lo avisa y sigue: sin
# registros nuevos, el inicio muestra el backup como atrasado.
record_run() {
  if ! docker compose exec -T -e RUN_KIND="$1" -e RUN_OK="$2" -e RUN_NAME="$3" -e RUN_DETAIL="$4" db sh -c \
    'psql -U postgres -d "$APP_DB_NAME" -v ON_ERROR_STOP=1 -q -v kind="$RUN_KIND" -v ok="$RUN_OK" -v name="$RUN_NAME" -v detail="$RUN_DETAIL"' \
    >/dev/null <<'SQL'; then
INSERT INTO backup_run (id, kind, ok, name, detail)
VALUES (gen_random_uuid(), :'kind', :'ok', NULLIF(:'name', ''), NULLIF(:'detail', ''));
SQL
    echo "AVISO: no se pudo registrar el resultado en la base; el inicio de la aplicación no lo va a mostrar." >&2
  fi
}

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

# "1 archivo" / "3 archivos".
plural() {
  if [ "$1" -eq 1 ]; then echo "$1 $2"; else echo "$1 $3"; fi
}

#!/usr/bin/env bash
# Prueba de restauración: restaura un backup en una base temporal del mismo
# servidor y verifica que esté completo. No toca la base ni los archivos de la
# aplicación, que sigue funcionando mientras tanto.
#
# Uso (en la carpeta del proyecto, con el .env de producción):
#   scripts/restore-test.sh [carpeta-del-backup]    (por defecto, el último backup)
#
# Verifica:
#   - las sumas SHA-256 del backup;
#   - que el dump se restaure completo, sin errores;
#   - que estén aplicadas todas las migraciones de esta versión de la app;
#   - que la bitácora de auditoría siga protegida contra cambios (triggers);
#   - que cada archivo registrado en la base esté en el backup con su SHA-256.
# Muestra además las filas por tabla del backup y de la base actual.
# Ver docs/operacion.md.
#
# Al terminar, bien o mal, lo registra en la base de la aplicación (tabla
# backup_run) para el aviso del inicio.
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
# shellcheck source=scripts/lib.sh
source scripts/lib.sh

TEST_DB=rrhh_prueba_restauracion
SRC=""
TMP=""
STEP="al buscar el backup"
FAILURES=0
PROBLEMS=""
finish() {
  local status=$?
  if [ -n "$TMP" ]; then
    docker compose exec -T db dropdb -U postgres --force --if-exists "$TEST_DB" >/dev/null 2>&1 || true
    rm -rf "$TMP"
  fi
  if [ "$status" -ne 0 ]; then
    local detail="Error $STEP."
    if [ "$FAILURES" -gt 0 ]; then
      detail="$(plural "$FAILURES" problema problemas): $PROBLEMS."
    else
      echo "Prueba de restauración FALLIDA: error $STEP." >&2
    fi
    record_run PRUEBA_RESTAURACION false "${SRC:+$(basename "$SRC")}" "$detail"
  fi
}
trap finish EXIT

# Un problema que no corta la prueba: se informa al final, con los demás.
fail() {
  echo "ERROR: $1" >&2
  FAILURES=$((FAILURES + 1))
  PROBLEMS="${PROBLEMS:+$PROBLEMS; }${1%.}"
}

DEST="$(backup_dir)"
SRC="${1:-$(find "$DEST" -mindepth 1 -maxdepth 1 -type d -name 'rrhh-*' 2>/dev/null | sort | tail -n 1)}"
if [ -z "$SRC" ] || [ ! -f "$SRC/base.dump" ] || [ ! -f "$SRC/archivos.tar.gz" ] || [ ! -f "$SRC/SHA256SUMS" ]; then
  echo "No encontré un backup para probar. Uso: scripts/restore-test.sh [carpeta-del-backup]." >&2
  STEP="al buscar el backup: no hay uno completo en ${SRC:-$DEST}"
  exit 1
fi
TMP="$(mktemp -d)"

echo "Backup: $SRC"
STEP="al verificar las sumas SHA-256"
echo "Verificando las sumas SHA-256..."
(cd "$SRC" && sha256sum --quiet -c SHA256SUMS)

STEP="al restaurar en la base temporal"
echo "Restaurando en la base temporal $TEST_DB..."
docker compose exec -T -e PGOPTIONS='-c client_min_messages=warning' db sh -c \
  "dropdb -U postgres --force --if-exists $TEST_DB && createdb -U postgres -O \"\$APP_DB_USER\" $TEST_DB"
docker compose exec -T db sh -c \
  "pg_restore -U postgres -d $TEST_DB --no-owner --role=\"\$APP_DB_USER\" --exit-on-error" <"$SRC/base.dump"

STEP="al verificar las migraciones"
echo "Verificando migraciones..."
APPLIED="$(psql_at "$TEST_DB" 'SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL')"
SHIPPED="$(compose_run migrate sh -c 'find prisma/migrations -mindepth 1 -maxdepth 1 -type d | wc -l')"
if [ "$APPLIED" -eq "$SHIPPED" ]; then
  echo "  $APPLIED migraciones aplicadas, las mismas que trae esta versión."
elif [ "$APPLIED" -lt "$SHIPPED" ]; then
  echo "  El backup tiene $APPLIED migraciones y esta versión trae $SHIPPED: al restaurarlo se aplican las que faltan."
else
  fail "el backup tiene $APPLIED migraciones y esta versión solo $SHIPPED: es de una versión más nueva de la aplicación."
fi

STEP="al verificar la protección de la auditoría"
echo "Verificando la protección de la auditoría..."
TRIGGERS="$(psql_at "$TEST_DB" "SELECT count(*) FROM pg_trigger WHERE tgrelid = 'audit_log'::regclass AND NOT tgisinternal")"
if [ "$TRIGGERS" -ge 2 ]; then
  echo "  audit_log sigue siendo de solo inserción ($TRIGGERS triggers)."
else
  fail "faltan los triggers que impiden modificar audit_log (hay $TRIGGERS)."
fi

STEP="al verificar los archivos adjuntos"
echo "Verificando los archivos adjuntos..."
mkdir "$TMP/archivos"
tar -C "$TMP/archivos" -xzf "$SRC/archivos.tar.gz"
psql_at "$TEST_DB" "SELECT sha256 || '  ' || storage_key FROM stored_file ORDER BY storage_key" >"$TMP/esperados"
EXPECTED="$(wc -l <"$TMP/esperados")"
if [ "$EXPECTED" -eq 0 ]; then
  echo "  La base no tiene archivos registrados."
elif (cd "$TMP/archivos" && sha256sum --quiet -c "$TMP/esperados"); then
  echo "  Los archivos registrados en la base ($EXPECTED) están en el backup, sin cambios."
else
  fail "hay archivos registrados en la base que faltan en el backup o no coinciden."
fi

STEP="al contar las filas por tabla"
echo "Filas por tabla (backup / base actual):"
TABLES="$(psql_at "$TEST_DB" "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename")"
LIVE_DB="$(docker compose exec -T db sh -c 'echo "$APP_DB_NAME"')"
TOTAL=0
for table in $TABLES; do
  restored="$(psql_at "$TEST_DB" "SELECT count(*) FROM \"$table\"")"
  live="$(psql_at "$LIVE_DB" "SELECT count(*) FROM \"$table\"" 2>/dev/null || echo "-")"
  TOTAL=$((TOTAL + restored))
  printf '  %-34s %8s / %s\n' "$table" "$restored" "$live"
done

if [ "$FAILURES" -gt 0 ]; then
  echo "Prueba de restauración FALLIDA ($(plural "$FAILURES" problema problemas)) para $(basename "$SRC")." >&2
  exit 1
fi
SUMMARY="$(plural "$TOTAL" fila filas), $(plural "$EXPECTED" archivo archivos)"
record_run PRUEBA_RESTAURACION true "$(basename "$SRC")" "$SUMMARY."
echo "Prueba de restauración correcta para $(basename "$SRC") ($(date -u +%Y-%m-%dT%H:%MZ)): $SUMMARY."

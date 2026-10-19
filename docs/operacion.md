# Operación en producción

Guía para instalar, actualizar, respaldar y mantener RRHHPP en un servidor propio (VPS) con Docker Compose. Está pensada para quien administra el servidor; no hace falta saber programar, pero sí manejarse con la consola de Linux.

> El sistema guarda datos personales, salariales y de salud del personal. Son datos sensibles según la Ley 25.326 de Protección de Datos Personales: el servidor, los backups y los archivos exportados tienen que tener acceso restringido. Esta guía marca los puntos donde eso importa.

Índice:

1. [Cómo está armado](#1-cómo-está-armado)
2. [Requisitos del servidor](#2-requisitos-del-servidor)
3. [Primera instalación](#3-primera-instalación)
4. [Proxy inverso y HTTPS](#4-proxy-inverso-y-https)
5. [Actualizar a una versión nueva](#5-actualizar-a-una-versión-nueva)
6. [Backups](#6-backups)
7. [Restauración](#7-restauración)
8. [Prueba de restauración](#8-prueba-de-restauración)
9. [Logs](#9-logs)
10. [Monitoreo](#10-monitoreo)
11. [Seguridad operativa](#11-seguridad-operativa)
12. [Recuperar el acceso de administrador](#12-recuperar-el-acceso-de-administrador)
13. [Mantenimiento de la base de datos](#13-mantenimiento-de-la-base-de-datos)
14. [Solución de problemas](#14-solución-de-problemas)
15. [Datos de demostración y entornos de prueba](#15-datos-de-demostración-y-entornos-de-prueba)

## 1. Cómo está armado

```
Internet ──HTTPS──▶ nginx (en el servidor, puertos 80 y 443)
                      │  http://127.0.0.1:3000
                      ▼
               ┌─────────────── Docker Compose (docker-compose.prod.yml) ───────────────┐
               │  app      servidor de la aplicación (Next.js)  ◀── volumen "storage"   │
               │  db       PostgreSQL 16, sin puertos expuestos ◀── volumen "pgdata"    │
               │  migrate  aplica las migraciones al iniciar y termina                  │
               └────────────────────────────────────────────────────────────────────────┘
scripts/backup.sh ──▶ ./backups/rrhh-AAAAMMDDTHHMMSSZ/ ──▶ copia cifrada fuera del servidor
```

| Pieza                     | Qué es                                                                                                                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docker-compose.prod.yml` | Los tres servicios de producción. El `docker-compose.yml` de la raíz es **solo para desarrollo** (usuario y contraseña conocidos, puerto 5432 abierto): nunca lo uses en el servidor.                                          |
| Imagen `rrhh-app`         | El servidor de la aplicación, sin código fuente ni dependencias de desarrollo. Corre como usuario sin privilegios.                                                                                                             |
| Imagen `rrhh-tools`       | Migraciones, seed base y recuperación del administrador. Es la que usa el servicio `migrate`.                                                                                                                                  |
| Volumen `pgdata`          | Los datos de PostgreSQL.                                                                                                                                                                                                       |
| Volumen `storage`         | Los archivos adjuntos (documentación del personal). Se guarda junto con la base en cada backup.                                                                                                                                |
| Usuarios de la base       | `postgres` (superusuario, solo para backups y mantenimiento) y el usuario de la aplicación (`APP_DB_USER`), dueño de la base pero **sin** privilegios de superusuario. Los crea la primera vez `docker/postgres/init-prod.sh`. |
| `deploy/nginx/rrhh.conf`  | Ejemplo de configuración de nginx con HTTPS.                                                                                                                                                                                   |
| `scripts/`                | `backup.sh`, `restore.sh` y `restore-test.sh`.                                                                                                                                                                                 |

No hay otros servicios: ni colas, ni tareas programadas dentro de la aplicación, ni envío de correos. Los backups se programan con el `cron` del servidor.

## 2. Requisitos del servidor

- **Linux** de 64 bits (x86_64 o arm64; las imágenes se construyen en el mismo servidor, para su arquitectura). Probado con Debian y Ubuntu.
- **Memoria**: la aplicación y la base usan alrededor de 200 MB en reposo, pero **construir la imagen** necesita más: el build medido usó 1,6 GB. Con 2 GB de RAM agregá 2 GB de swap; con 4 GB alcanza.
- **Disco**: unos 5 GB para las imágenes y la caché de construcción, más la base, los adjuntos y los backups locales (cada backup ocupa lo que la base comprimida más los adjuntos). Empezá con 40 GB y mirá el uso (sección 10).
- **Docker Engine** 24 o posterior con el plugin **Docker Compose** 2.24 o posterior (`docker compose version`). Instalalo desde los repositorios oficiales de Docker: <https://docs.docker.com/engine/install/>.
- **nginx** y **certbot** en el servidor (sección 4), y un **dominio** (por ejemplo `rrhh.empresa.com.ar`) que apunte a la IP del servidor.
- Puertos abiertos hacia internet: solo 22 (SSH), 80 y 443.
- Reloj sincronizado (NTP; viene activado en Debian y Ubuntu). La zona horaria del servidor no importa: la base trabaja en UTC y la aplicación muestra todo en la hora de Buenos Aires.

## 3. Primera instalación

Los comandos van en la consola del servidor, con un usuario que pueda usar Docker. En esta guía la carpeta del proyecto es `/opt/rrhh`.

### 3.1. Código

```bash
sudo mkdir -p /opt/rrhh && sudo chown "$USER" /opt/rrhh
git clone https://github.com/poncio16/RRHHPP.git /opt/rrhh
cd /opt/rrhh
```

Si el repositorio es privado, el servidor necesita una forma de leerlo (por ejemplo, una _deploy key_ de solo lectura en GitHub).

### 3.2. Archivo `.env`

```bash
cp .env.production.example .env
chmod 600 .env
openssl rand -hex 24   # una vez para POSTGRES_PASSWORD
openssl rand -hex 24   # y otra para APP_DB_PASSWORD
nano .env
```

| Variable                | Qué poner                                                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `COMPOSE_FILE`          | Dejar `docker-compose.prod.yml`. Así `docker compose ...` usa siempre el archivo de producción.                                               |
| `POSTGRES_PASSWORD`     | Contraseña del superusuario de PostgreSQL. Generada con `openssl rand -hex 24`.                                                               |
| `APP_DB_NAME`           | Nombre de la base de la aplicación (`rrhh`).                                                                                                  |
| `APP_DB_USER`           | Usuario de la base de la aplicación (`rrhh`).                                                                                                 |
| `APP_DB_PASSWORD`       | Su contraseña. Va dentro de una URL de conexión: usá solo letras y números (`openssl rand -hex 24`).                                          |
| `APP_URL`               | La dirección pública con `https://`, por ejemplo `https://rrhh.empresa.com.ar`. La aplicación la valida y la muestra en el log al iniciar.    |
| `TRUSTED_PROXY`         | `true`: la aplicación está detrás de nginx y toma de él la IP real de cada pedido (la que queda en la auditoría).                             |
| `LOG_LEVEL`             | `info` (también `fatal`, `error`, `warn`, `debug`, `trace` o `silent`).                                                                       |
| `APP_PORT`              | Puerto local donde escucha la aplicación, solo en `127.0.0.1` (por defecto `3000`). Si lo cambiás, cambialo también en `proxy_pass` de nginx. |
| `APP_VERSION`           | Etiqueta de las imágenes que se construyen (`latest`). Conviene cambiarla en cada actualización (sección 5).                                  |
| `BACKUP_DIR`            | Carpeta de los backups locales (`./backups`, dentro de la carpeta del proyecto).                                                              |
| `BACKUP_RETENTION_DAYS` | Días que se conservan los backups locales (`30`).                                                                                             |

La aplicación recibe solo las variables que necesita (no ve `POSTGRES_PASSWORD`). Si alguna falta o tiene un formato inválido, el contenedor `app` no arranca y su log dice cuál es.

Guardá una copia del `.env` en un lugar seguro y separado de los backups (por ejemplo, el gestor de contraseñas de la empresa): sin él, un backup se puede restaurar igual, pero hay que generar contraseñas nuevas.

### 3.3. Construir y levantar

```bash
docker compose build          # unos minutos la primera vez
docker compose up -d --wait   # base, migraciones y aplicación
docker compose ps -a
```

`db` y `app` tienen que figurar `healthy`, y `migrate` como `Exited (0)`: aplica las migraciones pendientes y termina, es lo esperado. La aplicación arranca solo si las migraciones terminaron bien.

```bash
curl -fsS http://127.0.0.1:3000/api/health   # {"status":"ok","database":"ok"}
```

### 3.4. Datos base y administrador inicial

La base está vacía. El **seed base** carga lo que la aplicación necesita para funcionar: provincias y listas, los cuatro roles con sus permisos, los parámetros de seguridad, tipos de documento, tipos de licencia y reglas de vacaciones, conceptos de remuneración, tipos de novedad, bancos, tipos de contrato y de jornada. **No** carga empresa, personas ni datos de demostración. También crea el administrador inicial si no hay ninguno.

```bash
read -rp "Email del administrador: " SEED_ADMIN_EMAIL
read -rsp "Contraseña temporal: " SEED_ADMIN_PASSWORD; echo
export SEED_ADMIN_EMAIL SEED_ADMIN_PASSWORD
docker compose run --rm -e SEED_ADMIN_EMAIL -e SEED_ADMIN_PASSWORD migrate npm run db:seed:base
unset SEED_ADMIN_EMAIL SEED_ADMIN_PASSWORD
```

Así la contraseña no queda en el historial de la consola ni en el `.env`. El seed se puede repetir sin duplicar nada y nunca pisa lo que se cambió desde la aplicación. En producción carga solo los datos base aunque se ejecute `npm run db:seed`.

### 3.5. Proxy inverso y HTTPS

Seguí la sección 4. Sin HTTPS no se puede iniciar sesión: la cookie de sesión es `Secure`.

### 3.6. Primer ingreso y configuración

1. Entrá a `https://<dominio>/login` con el administrador inicial. El sistema obliga a cambiar la contraseña temporal.
2. **Configuración → Empresa**: razón social, CUIT y domicilio.
3. **Configuración → Parámetros**: revisá seguridad (inactividad, duración de la sesión, intentos y bloqueo, largo de contraseña), documentación, licencias, vacaciones, asistencia, alertas, backups y rangos de antigüedad.
4. **Configuración → Feriados**: cargá los del año según el calendario oficial (no vienen precargados porque cambian cada año).
5. **Configuración → Catálogos y Horarios**: sectores, puestos, establecimientos, convenios y categorías, obras sociales, ART y horarios de la empresa. En los puestos, la descripción y los elementos de protección personal que indica higiene y seguridad, y en los establecimientos, el domicilio completo con código postal: salen en el formulario de entrega de EPP.
6. Revisá con el asesor laboral los **tipos de licencia**, las **reglas de vacaciones**, los tipos de novedad y qué **tipos de documento** son obligatorios en todo legajo (en los mensuales, como el recibo de sueldo, desde qué mes se controlan): los valores del seed son de referencia y hay que validarlos. Con el contador, elegí qué tipos de novedad son columnas de la planilla de novedades y en qué orden ("Columna en la planilla del contador"). Verificá los **bancos** con el listado del BCRA.
7. **Usuarios y permisos**: creá un usuario con nombre para cada persona (nunca cuentas compartidas) y un **segundo Administrador**, para no depender de una sola cuenta.
8. Programá los backups (sección 6) y hacé una primera prueba de restauración (sección 8).

Para cargar el personal existente podés usar **Importar** con la plantilla de Excel. Los sectores, puestos y establecimientos que todavía no cargaste se dan de alta al confirmar la importación (la vista previa los lista antes); después completá sus datos en Catálogos, como en el paso 5.

Mientras falte algo, el **Inicio** muestra la tarjeta "Puesta en marcha" con los pasos que el sistema puede verificar (empresa, sectores, puestos, establecimientos, horarios, feriados del año, el primer legajo y el segundo administrador), cada uno a quien tiene permiso para hacerlo. Los parámetros y la revisión con el asesor no se pueden verificar desde la aplicación: mientras dure la puesta en marcha, la tarjeta solo se los recuerda al administrador. Los backups se controlan en el servidor (sección 6). Cerca de fin de año (30 días antes del 1 de enero por defecto, se cambia en Parámetros → Alertas) también pide los feriados del año siguiente. Si solo faltan feriados, la tarjeta se llama "Configuración pendiente".

## 4. Proxy inverso y HTTPS

La aplicación escucha solo en `127.0.0.1:3000`: desde internet se llega únicamente a través de nginx, que pone el certificado HTTPS. El ejemplo completo está en [`deploy/nginx/rrhh.conf`](../deploy/nginx/rrhh.conf) y fue probado con nginx 1.29.

### 4.1. Instalación con Let's Encrypt

```bash
sudo apt install nginx certbot
# 1. Certificado: el sitio por defecto de nginx sirve /var/www/html en el puerto 80.
sudo certbot certonly --webroot -w /var/www/html -d rrhh.empresa.com.ar
# 2. Sitio de la aplicación.
sudo cp deploy/nginx/rrhh.conf /etc/nginx/sites-available/rrhh.conf
sudo sed -i 's/rrhh.ejemplo.com.ar/rrhh.empresa.com.ar/g' /etc/nginx/sites-available/rrhh.conf
sudo ln -s /etc/nginx/sites-available/rrhh.conf /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
# 3. Renovación automática (certbot instala un timer); probarla:
sudo certbot renew --dry-run
```

La renovación usa la ruta `/.well-known/acme-challenge/` del puerto 80, que el ejemplo deja disponible.

### 4.2. Qué hace cada parte

| Configuración                                         | Por qué                                                                                                                                                                                                                                      |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Puerto 80 redirige a HTTPS                            | La cookie de sesión solo viaja por HTTPS. La aplicación además manda `Strict-Transport-Security`: después de la primera visita, el navegador usa HTTPS siempre para ese dominio durante un año.                                              |
| `client_max_body_size 21m`                            | Igual al límite de la aplicación para adjuntos e importaciones. Con el valor por defecto de nginx (1 MB) fallan las subidas de archivos.                                                                                                     |
| `proxy_set_header Host`, `X-Forwarded-*`, `X-Real-IP` | La aplicación compara el origen de cada formulario con el dominio (`Host`) y toma la IP real de `X-Real-IP` (con `TRUSTED_PROXY=true`). Van a nivel `server`: una `location` que define sus propios encabezados deja de heredar todos estos. |
| `proxy_buffering off`                                 | Las páginas llegan por partes (primero la estructura, después los datos); nginx no tiene que juntarlas.                                                                                                                                      |
| `limit_req` en `POST /login`                          | Hasta 10 intentos de ingreso por minuto por IP, con margen de 10. Se suma al bloqueo de cuentas de la aplicación. Si muchos usuarios entran a la vez desde la misma IP pública (una oficina), subí `rate` o `burst`.                         |
| Sin encabezados de seguridad en nginx                 | CSP, HSTS, `X-Frame-Options` y demás los manda la aplicación; repetirlos en nginx los duplica.                                                                                                                                               |

Si el sitio se publica en un puerto que no es el 443 (por ejemplo `https://servidor:8443`), cambiá `$host` por `$http_host` en `Host` y `X-Forwarded-Host`: `$host` no incluye el puerto y la aplicación rechaza los formularios porque el origen no coincide.

Otro proxy (Caddy, Traefik, un balanceador) sirve igual si cumple lo mismo: HTTPS, límite de 21 MB, sin buffering, los mismos encabezados y la aplicación accesible solo desde el proxy.

## 5. Actualizar a una versión nueva

```bash
cd /opt/rrhh
scripts/backup.sh                          # 1. backup antes de tocar nada
git fetch && git checkout <versión>        # 2. código nuevo (o git pull)
nano .env                                  # 3. APP_VERSION=<versión> (por ejemplo 2026-10-12)
docker compose build                       # 4. imágenes nuevas, con la etiqueta nueva
docker compose up -d --wait                # 5. migraciones pendientes y aplicación nueva
curl -fsS http://127.0.0.1:3000/api/health
```

- Mientras se reemplaza el contenedor, la aplicación no responde unos segundos. Quien tenga una página abierta puede ver un error en la próxima acción: recargando la página se resuelve.
- Las migraciones solo avanzan; no se deshacen. Si la versión nueva trae tipos o catálogos base nuevos, la nota de la versión lo indica: se cargan con `docker compose run --rm migrate npm run db:seed:base`, que solo agrega lo que falta.
- **Volver atrás**: si la versión nueva no aplicó migraciones, alcanza con volver `APP_VERSION` al valor anterior (las imágenes viejas siguen en el servidor) y `docker compose up -d --wait`. Si aplicó migraciones, la imagen vieja puede no entender la base nueva: volvé `APP_VERSION` y el código (`git checkout <versión anterior>`) y restaurá el backup del paso 1 (sección 7).
- Cada tanto, liberá espacio de imágenes y caché viejas, conservando la versión anterior: `docker image ls rrhh-app`, `docker image rm rrhh-app:<vieja> rrhh-tools:<vieja>` y `docker builder prune`.

## 6. Backups

### 6.1. Qué se respalda

| Qué                  | Cómo                                                                      |
| -------------------- | ------------------------------------------------------------------------- |
| Base de datos        | `pg_dump` en formato custom (`base.dump`), con la aplicación funcionando. |
| Archivos adjuntos    | El volumen `storage` completo (`archivos.tar.gz`).                        |
| Verificación         | `SHA256SUMS` con las sumas de los dos archivos.                           |
| `.env` (contraseñas) | **No** va en el backup: se guarda aparte y seguro (sección 3.2).          |

Primero se copia la base y después los archivos. Un archivo se guarda en disco antes que su registro en la base y nunca se reemplaza, así que todo lo que figura en el dump está en el tar; como mucho, el tar tiene algún archivo de más, que no molesta.

### 6.2. Backup manual

```bash
cd /opt/rrhh
scripts/backup.sh               # en BACKUP_DIR (./backups)
scripts/backup.sh /mnt/backups  # o en otra carpeta
```

Crea `backups/rrhh-AAAAMMDDTHHMMSSZ/` (hora UTC) con permisos solo para el dueño, verifica que el dump se pueda leer y que el tar no esté dañado, y borra los backups locales más viejos que `BACKUP_RETENTION_DAYS`. Si algo falla, termina con error y no deja un backup a medias.

Al terminar, bien o mal, registra el resultado en la base de la aplicación (tabla `backup_run`: carpeta, tamaño o motivo del error), y el **Inicio** se lo muestra a quien administra los parámetros (sección 10).

### 6.3. Backup diario con cron

`/etc/cron.d/rrhh-backup` (reemplazá `rrhh` por el usuario que maneja Docker en el servidor):

```
# Backup diario a las 3:30 (hora del servidor) y prueba de restauración los domingos.
30 3 * * * rrhh cd /opt/rrhh && scripts/backup.sh >> /var/log/rrhh/backup.log 2>&1
30 4 * * 0 rrhh cd /opt/rrhh && scripts/restore-test.sh >> /var/log/rrhh/backup.log 2>&1
```

```bash
sudo mkdir -p /var/log/rrhh && sudo chown rrhh /var/log/rrhh
```

### 6.4. Copia fuera del servidor

Un backup en el mismo servidor no sirve si se pierde el servidor. Copiá cada backup a otro lugar (un almacenamiento de la empresa, otro servidor, un servicio de almacenamiento en la nube) y **cifralo antes**, porque contiene datos personales, salariales y de salud. Por ejemplo, con `gpg` y una frase de paso guardada en el gestor de contraseñas:

```bash
B=rrhh-20261012T063000Z
tar -C backups -cf - "$B" | gpg --symmetric --cipher-algo AES256 -o "/mnt/externo/$B.tar.gpg"
# Para recuperarlo:
gpg -d /mnt/externo/$B.tar.gpg | tar -C backups -xf -
```

La retención fuera del servidor (cuántos backups diarios, semanales y mensuales se conservan) la define la empresa. Limitá quién puede leer esa copia.

## 7. Restauración

`scripts/restore.sh` **reemplaza** la base de datos de la aplicación por la de un backup:

```bash
cd /opt/rrhh
scripts/restore.sh backups/rrhh-20261012T063000Z
```

1. Verifica las sumas SHA-256 del backup y pide escribir `RESTAURAR` para seguir.
2. Detiene la aplicación, borra la base y la vuelve a crear vacía, a nombre del usuario de la aplicación.
3. Restaura el dump completo (si algo falla, se detiene) y **cierra todas las sesiones**: cada usuario vuelve a ingresar.
4. Copia los archivos del backup al volumen de adjuntos. Cada archivo tiene un nombre único: no se pisa ni se borra ninguno.
5. Levanta la aplicación, que antes aplica las migraciones pendientes (si el backup es de una versión anterior).

Lo cargado después del backup se pierde. Antes de restaurar en serio, probá ese mismo backup con `scripts/restore-test.sh`.

Después de restaurar, hacé un backup (sección 6.2): la base restaurada trae los registros de backups solo hasta el anterior al que se restauró, así que el Inicio puede mostrar el backup como atrasado hasta que se haga uno nuevo.

**En un servidor nuevo**: hacé la instalación de la sección 3 hasta el paso 3.3 (sin el seed base), copiá la carpeta del backup a `backups/` y ejecutá `scripts/restore.sh`. Los nombres y contraseñas del `.env` pueden ser otros: todo queda a nombre del usuario de la aplicación del servidor nuevo.

Un backup de una versión **más nueva** que el código instalado no se tiene que restaurar sobre esa versión: actualizá primero el código (la prueba de restauración lo avisa).

## 8. Prueba de restauración

```bash
scripts/restore-test.sh                                 # el último backup
scripts/restore-test.sh backups/rrhh-20261012T063000Z   # uno en particular
```

Restaura el backup en una base temporal del mismo servidor (`rrhh_prueba_restauracion`), sin tocar la base ni los archivos de la aplicación, que sigue funcionando. Verifica:

- las sumas SHA-256 del backup;
- que el dump se restaure completo, sin errores;
- que tenga aplicadas las migraciones de la versión instalada (o menos, si es de una versión anterior);
- que la bitácora de auditoría siga protegida contra cambios;
- que cada archivo registrado en la base esté en el backup con su SHA-256.

Muestra además las filas por tabla del backup y de la base actual, y termina con una línea como `Prueba de restauración correcta para rrhh-20261012T063000Z (2026-10-12T07:30Z): 15230 filas, 412 archivos.` Si algo no coincide, termina con error y lo explica. Al final borra la base temporal y, como el backup, registra el resultado en la base de la aplicación para el Inicio.

Hacela al menos una vez por mes y después de cada actualización (el ejemplo de cron la corre todos los domingos), y guardá el resultado. Una vez por año conviene además una restauración completa en otro servidor, siguiendo la sección 7.

## 9. Logs

```bash
docker compose logs -f app                 # en vivo
docker compose logs --since 24h app        # últimas 24 horas
docker compose logs migrate                # resultado de las migraciones
```

Cada línea del log de la aplicación es un JSON: `level` (30 informativo, 40 aviso, 50 error), `time` (milisegundos desde 1970, UTC) y `msg`. Con `jq` se filtran los errores:

```bash
docker compose logs --no-log-prefix app | grep '^{' | jq -c 'select(.level >= 50)'
```

- Cuando algo falla sin un motivo conocido, el usuario ve "Ocurrió un error inesperado. Si persiste, informá el código 1a2b3c4d.". Ese código está en el campo `reference` del log: `docker compose logs app | grep 1a2b3c4d`.
- Los logs nunca incluyen contraseñas, tokens de sesión ni CBU.
- Docker rota los logs: hasta 5 archivos de 10 MB por contenedor (`docker-compose.prod.yml`).
- Quién hizo qué en el sistema (altas, cambios, ingresos, exportaciones, descargas) no está en los logs sino en **Auditoría**, dentro de la aplicación.

## 10. Monitoreo

- **Estado**: `GET /api/health` responde `200 {"status":"ok","database":"ok"}` si la aplicación llega a la base y `503` si no. No pide sesión: se puede vigilar desde afuera con cualquier servicio de monitoreo, contra `https://<dominio>/api/health`. Un 200 no garantiza que se haya cargado el seed base.
- **Contenedores**: `docker compose ps` muestra `healthy` o `unhealthy`. Con `restart: unless-stopped`, `db` y `app` vuelven solos después de un reinicio del servidor o de Docker.
- **Disco**: `df -h` y `docker system df`. Crecen la base, los adjuntos, los backups locales y la caché de construcción de imágenes (`docker builder prune` la libera). Sin espacio, PostgreSQL se detiene.
- **Backups**: en el **Inicio**, quien tiene el permiso "Administrar empresa y parámetros generales" ve el último backup y la última prueba de restauración, y un aviso en rojo arriba de todo si el último falló o si el último correcto es más viejo que el máximo de Configuración → Parámetros → Backups (26 horas y 35 días por defecto; 0 desactiva el aviso). Sin ningún registro, avisa cuando pasa ese máximo desde la instalación o desde la actualización a la versión que los registra. Los scripts registran el resultado al terminar; si no pueden (por ejemplo, con la base detenida), lo dicen en el log y el Inicio lo muestra como atrasado. El detalle de cada ejecución está en `/var/log/rrhh/backup.log`. Para alertar desde afuera si no hay un backup del último día: `find /opt/rrhh/backups -maxdepth 1 -name 'rrhh-*' -mtime -1 | grep -q . || echo "Sin backup reciente"`.
- **Certificado**: `sudo certbot certificates` muestra el vencimiento; la renovación es automática.
- **Ingresos fallidos**: en **Auditoría**, filtrando por resultado "Fallido".

## 11. Seguridad operativa

- `.env` con permisos `600` y dueño el usuario que maneja Docker. Las contraseñas solo van ahí, nunca en el repositorio.
- **Firewall**: solo 22, 80 y 443 (`sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable`). Los puertos que publica Docker no pasan por `ufw`: por eso la aplicación se publica solo en `127.0.0.1` y la base no se publica. No agregues `ports` a `db`.
- **Acceso al servidor**: SSH con clave (sin contraseña) y actualizaciones de seguridad automáticas (`unattended-upgrades`). Pertenecer al grupo `docker` equivale a ser administrador del servidor: limitá quién lo tiene.
- **Cuentas de la aplicación**: una por persona, con su nombre; desactivá las de quienes dejan la empresa (Usuarios y permisos). Mantené al menos dos administradores activos.
- **Parámetros de seguridad** en Configuración → Parámetros → Seguridad: cierre por inactividad (30 minutos por defecto), duración máxima de la sesión, intentos fallidos antes del bloqueo (5), duración del bloqueo (15 minutos) y largo mínimo de contraseña (10).
- **Datos sensibles fuera del sistema**: los backups y los Excel o CSV exportados tienen los mismos datos que la base. Copias cifradas, acceso limitado y borrado de las exportaciones que ya no se usan.
- **Dependencias**: al actualizar, revisá las notas de la versión; `npm audit --omit=dev` lista los avisos de seguridad de las dependencias.

## 12. Recuperar el acceso de administrador

No hay recuperación de contraseña por correo. Si un administrador se olvidó la contraseña o quedó bloqueado, otro administrador lo resuelve desde **Usuarios** (blanquear contraseña, desbloquear). Si no queda ningún administrador que pueda ingresar, desde la consola del servidor:

```bash
read -rp "Email: " ADMIN_EMAIL
read -rsp "Contraseña temporal: " ADMIN_PASSWORD; echo
export ADMIN_EMAIL ADMIN_PASSWORD
docker compose run --rm -e ADMIN_EMAIL -e ADMIN_PASSWORD migrate npm run admin:recuperar
unset ADMIN_EMAIL ADMIN_PASSWORD
```

Si el email existe: contraseña nueva, rol Administrador, cuenta activa y desbloqueada, y todas sus sesiones cerradas. Si no existe, crea un administrador con ese email. La contraseña tiene que cumplir el largo mínimo de los parámetros de seguridad y combinar letras y números, y hay que cambiarla al ingresar. Queda en la auditoría como "Recuperación de acceso desde la consola del servidor", sin la contraseña.

## 13. Mantenimiento de la base de datos

No hace falta mantenimiento periódico: PostgreSQL limpia y reorganiza solo (autovacuum).

- La **auditoría** crece siempre: es de solo inserción y no se depura. Para ver su tamaño: `docker compose exec db psql -U postgres -d rrhh -c "SELECT pg_size_pretty(pg_total_relation_size('audit_log'))"`.
- **Actualizar PostgreSQL dentro de la versión 16** (por ejemplo, 16.15 → 16.16): cambiá la etiqueta de la imagen en `docker-compose.prod.yml`, hacé un backup y `docker compose up -d --wait`. Los datos se conservan.
- **Cambio de la biblioteca ICU**: el orden alfabético en español usa la intercalación `es-AR-x-icu`. Si una imagen nueva de PostgreSQL trae otra versión de ICU, el log de la base avisa "collation version mismatch". En ese caso, en una ventana sin uso:

  ```bash
  docker compose exec db psql -U postgres -d rrhh -c 'REINDEX DATABASE rrhh' \
    -c 'ALTER COLLATION pg_catalog."es-AR-x-icu" REFRESH VERSION' \
    -c 'ALTER DATABASE rrhh REFRESH COLLATION VERSION'
  ```

- **Cambiar de versión mayor** (16 → 17): los datos no son compatibles entre versiones mayores. Hacé un backup, probalo con `scripts/restore-test.sh`, detené todo (`docker compose down`), renombrá o borrá el volumen `rrhh_pgdata` (solo con el backup verificado y copiado fuera del servidor), cambiá la imagen, `docker compose up -d --wait` y restaurá con `scripts/restore.sh`.

## 14. Solución de problemas

| Síntoma                                                                                   | Causa probable y solución                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Después de ingresar vuelve a la pantalla de login                                         | Se entra por `http://`: la cookie de sesión exige HTTPS. Configurá nginx con HTTPS (sección 4) y entrá por `https://`.                                                                                                                                         |
| Cualquier formulario da error y el log dice `Invalid Server Actions request`              | El dominio que recibe la aplicación no coincide con el del navegador: faltan los encabezados `Host` / `X-Forwarded-Host` en nginx, o el sitio usa un puerto que no es el 443 (usá `$http_host`, sección 4.2).                                                  |
| `413 Request Entity Too Large` al subir un archivo                                        | Falta `client_max_body_size 21m` en nginx.                                                                                                                                                                                                                     |
| `429 Too Many Requests` al ingresar                                                       | El límite de intentos de nginx. Si es una oficina con muchos usuarios detrás de la misma IP, subí `rate` o `burst` en la configuración.                                                                                                                        |
| El contenedor `app` se reinicia una y otra vez                                            | `docker compose logs app`: si dice "Variables de entorno inválidas o faltantes", corregí el `.env` y `docker compose up -d --wait`.                                                                                                                            |
| `app` no arranca y `migrate` figura `Exited (1)`                                          | Falló una migración: `docker compose logs migrate`. Corregí la causa (por ejemplo, espacio en disco) y repetí `docker compose up -d --wait`. Si la migración quedó a medias, no la marques a mano como aplicada: restaurá el backup previo a la actualización. |
| `/api/health` responde 503                                                                | La aplicación no llega a la base: `docker compose ps db` y `docker compose logs db`.                                                                                                                                                                           |
| "Ocurrió un error inesperado. Si persiste, informá el código …"                           | Buscá el código en el log (sección 9).                                                                                                                                                                                                                         |
| Una cuenta está bloqueada                                                                 | Se desbloquea sola después de la duración del bloqueo (15 minutos por defecto), o la desbloquea un administrador en Usuarios. Sin administradores disponibles: sección 12.                                                                                     |
| Después de actualizar, una pantalla abierta da error                                      | La página es de la versión anterior: recargala.                                                                                                                                                                                                                |
| `docker compose` dice que falta una variable (`Definí APP_DB_PASSWORD en .env`)           | El comando no se ejecutó en la carpeta del proyecto, o el `.env` está incompleto.                                                                                                                                                                              |
| `docker compose` levanta un PostgreSQL con el puerto 5432 abierto y usuario `rrhh`/`rrhh` | Se usó el compose de desarrollo: falta `COMPOSE_FILE=docker-compose.prod.yml` en el `.env`. Detenelo con `docker compose -f docker-compose.yml down`.                                                                                                          |

## 15. Datos de demostración y entornos de prueba

- En producción el seed carga **solo datos base**: con `NODE_ENV=production` (siempre, en la imagen de herramientas) ignora los datos de demostración aunque se ejecute `npm run db:seed`. La empresa y las 24 personas ficticias de la demostración son solo para desarrollo.
- Nunca copies datos reales a una computadora de desarrollo ni a una base de pruebas. Las pruebas automáticas dan de alta y egresan empleados, cambian contraseñas y la base de `TEST_DATABASE_URL` se vacía en cada corrida.
- Para comprobar que un backup real sirve, usá `scripts/restore-test.sh` en el mismo servidor: no saca los datos de ahí.

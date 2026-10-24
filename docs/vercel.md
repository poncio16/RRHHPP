# Instalación en Vercel y Neon

Guía para publicar RRHHPP en internet sin un servidor propio: la aplicación en **Vercel**, la base de datos en **Neon** (PostgreSQL) y los archivos adjuntos en **Vercel Blob**, con los backups a cargo de **GitHub Actions**. Es la misma forma en que corre el dashboard financiero. La otra forma de instalarlo, con Docker en un servidor propio, está en [operacion.md](operacion.md); la aplicación es la misma.

> El sistema guarda datos personales, salariales y de salud del personal: son datos sensibles según la Ley 25.326. Con esta instalación quedan en Vercel y Neon, que los procesan principalmente en Estados Unidos (el acuerdo de tratamiento de datos de Vercel cubre los planes Pro y Enterprise). Conviene que lo valide el asesor legal o contable de la empresa antes de cargar datos reales.

Índice:

1. [Cómo está armado](#1-cómo-está-armado)
2. [Qué hace falta](#2-qué-hace-falta)
3. [Primera instalación](#3-primera-instalación)
4. [Actualizar a una versión nueva](#4-actualizar-a-una-versión-nueva)
5. [Backups](#5-backups)
6. [Prueba de restauración](#6-prueba-de-restauración)
7. [Restauración](#7-restauración)
8. [Recuperar el acceso de administrador](#8-recuperar-el-acceso-de-administrador)
9. [Diferencias con la instalación en un servidor](#9-diferencias-con-la-instalación-en-un-servidor)
10. [Solución de problemas](#10-solución-de-problemas)

## 1. Cómo está armado

```
Navegador ──HTTPS──▶ Vercel (aplicación, São Paulo) ──▶ Neon (PostgreSQL, São Paulo)
    │                     │
    │ adjuntos            └──▶ Vercel Blob privado "rrhh-archivos" (adjuntos)
    └───────────────────────────▶ (subida directa, con una URL firmada)

GitHub Actions ──▶ todos los días: backup de la base y de los adjuntos a otro
                   Vercel Blob privado, "rrhh-backups"; los domingos, prueba de
                   restauración. Cada resultado queda en la base para el Inicio.
```

| Pieza                                   | Qué es                                                                                                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Proyecto de Vercel                      | Publica la aplicación cada vez que cambia la rama `main` del repositorio. Antes de construirla aplica las migraciones y carga los datos base (`scripts/nube/vercel-build.mjs`).             |
| Base de Neon                            | PostgreSQL. La aplicación usa la conexión con pooler (`DATABASE_URL`); las migraciones y los backups, la directa (`DIRECT_URL`).                                                            |
| Almacén `rrhh-archivos`                 | Los adjuntos de documentos y las fotos de los legajos. Es **privado**: un archivo no se puede abrir por su dirección; se descarga por la aplicación, que verifica la sesión y los permisos. |
| Almacén `rrhh-backups`                  | Los backups. No está conectado a la aplicación: ella no puede leerlos ni borrarlos.                                                                                                         |
| `.github/workflows/backup-nube.yml`     | Backup diario y prueba de restauración semanal (secciones 5 y 6).                                                                                                                           |
| `.github/workflows/restaurar-nube.yml`  | Restauración de un backup, a mano (sección 7).                                                                                                                                              |
| `.github/workflows/recuperar-admin.yml` | Recuperación del acceso de administrador, a mano (sección 8).                                                                                                                               |
| `vercel.json`                           | Región São Paulo (`gru1`), el comando de build y que solo se publique `main`.                                                                                                               |

Vercel no acepta pedidos de más de 4,5 MB. Por eso los adjuntos de los documentos (hasta 20 MB) no pasan por la aplicación: el navegador los sube directo al almacén con una dirección firmada que sirve solo para ese archivo, ese tamaño máximo y durante 30 minutos. Después la aplicación lo lee, verifica que sea un PDF, PNG o JPG de verdad y calcula su SHA-256, como con Docker.

## 2. Qué hace falta

- **Vercel, plan Pro** (USD 20 por mes con USD 20 de consumo incluido). El plan gratuito (Hobby) es solo para uso personal y no comercial: una empresa no lo puede usar.
- **Neon**. El plan gratuito alcanza para empezar (1 GB por proyecto; restaura cambios de hasta 6 horas atrás). Los planes pagos amplían ese plazo, que es la primera línea de defensa ante un error (sección 7).
- **GitHub**: el repositorio, con permiso para crear secretos y correr Actions. El repositorio es **público**: los logs de Actions también lo son. Los scripts de backup no muestran datos de la base, pero nunca agregues pasos que los muestren.
- La cuenta de Vercel tiene que tener el repositorio conectado (como el dashboard financiero).

## 3. Primera instalación

### 3.1. Base en Neon

1. En Neon, creá un proyecto `rrhh` en la región **AWS São Paulo** (`aws-sa-east-1`), con la versión de PostgreSQL que proponga (16 o posterior).
2. En **Connect**, copiá dos cadenas de conexión de la base:
   - con **Connection pooling** activado: va a ser `DATABASE_URL` (el servidor tiene `-pooler` en el nombre);
   - sin pooling: va a ser `DIRECT_URL`.

Guardalas en el gestor de contraseñas de la empresa: dan acceso completo a los datos.

### 3.2. Almacenes de Vercel Blob

En Vercel, **Storage → Create → Blob**, creá dos almacenes **privados** en la región São Paulo (`gru1`). Que sean privados es indispensable: en uno público, cualquiera con la dirección de un archivo puede abrirlo sin ingresar a la aplicación.

1. `rrhh-archivos`: **conectalo al proyecto** de RRHH (sección 3.3), solo al entorno **Production**. Vercel agrega las variables que usa la aplicación.
2. `rrhh-backups`: **no** lo conectes a ningún proyecto.

De cada uno copiá el **token de lectura y escritura** (`BLOB_READ_WRITE_TOKEN`, en la página del almacén): son los secretos `APP_BLOB_TOKEN` y `BACKUP_BLOB_TOKEN` de GitHub (sección 3.6).

### 3.3. Proyecto en Vercel

1. **Add New → Project**, elegí el repositorio `RRHHPP`. Vercel reconoce Next.js; no cambies el comando de build (lo fija `vercel.json`).
2. Antes de publicar, en **Environment Variables**, cargá estas variables **solo para Production**:

| Variable              | Valor                                                                                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`        | La cadena de Neon con pooling.                                                                                                                            |
| `DIRECT_URL`          | La cadena de Neon sin pooling. La usan las migraciones al publicar.                                                                                       |
| `STORAGE_DRIVER`      | `vercel-blob`. Se usa también al construir (la política de seguridad del navegador habilita la subida al almacén).                                        |
| `SEED_ADMIN_EMAIL`    | Email del primer administrador.                                                                                                                           |
| `SEED_ADMIN_PASSWORD` | Su contraseña inicial, que cumpla la política de contraseñas. Tiene que cambiarla al ingresar. **Borrá esta variable** después de la primera publicación. |
| `APP_URL`             | Opcional. Por defecto, la dirección de producción del proyecto (`https://….vercel.app` o el dominio propio). Solo se valida y se muestra en el log.       |
| `LOG_LEVEL`           | Opcional (`info` por defecto).                                                                                                                            |

No hace falta `TRUSTED_PROXY`: en Vercel la IP real del cliente siempre llega en `X-Real-IP` y la aplicación la toma sola. Tampoco `STORAGE_DIR`.

Solo se publica la rama `main` (`vercel.json`): las ramas de los pull requests no generan vistas previas, que usarían la misma base y los mismos archivos que producción.

### 3.4. Primera publicación y administrador

Con **Deploy** (o el próximo cambio en `main`), Vercel:

1. instala las dependencias;
2. aplica las migraciones con `DIRECT_URL` (`prisma migrate deploy`);
3. carga los datos base y crea el administrador de `SEED_ADMIN_EMAIL` si no hay ninguno (es idempotente: en las publicaciones siguientes no cambia nada);
4. construye y publica la aplicación.

Si falta una variable o una migración falla, la publicación falla y el log de Vercel (**Deployments → la publicación → Building**) dice cuál. Ingresá con el administrador, cambiá la contraseña y seguí con la configuración inicial como en [operacion.md, sección 3.6](operacion.md#36-primer-ingreso-y-configuración). Después **borrá `SEED_ADMIN_PASSWORD`** de las variables de Vercel.

### 3.5. Límite de intentos de ingreso por IP

La aplicación bloquea una cuenta después de varios intentos fallidos (Parámetros → Seguridad). El límite por IP, que con Docker pone nginx, en Vercel es una regla del Firewall del proyecto (**Firewall → Configure → New Rule**):

- **Si**: el método (`Method`) es `POST` **y** la ruta (`Request Path`) es igual a `/login`.
- **Entonces**: **Rate Limit**, ventana fija de 60 segundos, 10 pedidos por IP; al superarlo, **Deny** (respuesta 429).

Guardá y publicá la regla (**Review Changes → Publish**).

### 3.6. Secretos de GitHub para los backups

En el repositorio, **Settings → Secrets and variables → Actions → New repository secret**:

| Secreto             | Valor                                               |
| ------------------- | --------------------------------------------------- |
| `DIRECT_URL`        | La cadena de Neon **sin** pooling.                  |
| `APP_BLOB_TOKEN`    | El token de lectura y escritura de `rrhh-archivos`. |
| `BACKUP_BLOB_TOKEN` | El token de lectura y escritura de `rrhh-backups`.  |

Opcional, en la pestaña **Variables**: `BACKUP_RETENTION_DAYS`, cuántos días se conservan los backups (30 por defecto).

GitHub nunca vuelve a mostrar un secreto: guardalos también en el gestor de contraseñas.

### 3.7. Verificar

1. Cargá un documento con un PDF de más de 5 MB y descargalo: tiene que bajar igual que se subió. Probá también la foto de un legajo y una exportación a Excel.
2. En GitHub, **Actions → Backup en la nube → Run workflow** con la tarea `backup`, y después con `prueba de restauración`. Las dos tienen que terminar en verde, y el **Inicio** de la aplicación las muestra en la tarjeta **Backups**.
3. Intentá ingresar 11 veces seguidas con un email que no exista (para no bloquear ninguna cuenta): la regla del punto 3.5 tiene que frenar el intento número 11.

## 4. Actualizar a una versión nueva

Cada cambio que llega a `main` (por ejemplo, al mergear un pull request) se publica solo, con sus migraciones. Si la publicación falla, sigue funcionando la versión anterior.

Las migraciones se aplican **antes** de construir: si el build falla después de migrar, la versión anterior sigue atendiendo con la base ya migrada. Por eso las migraciones de este proyecto agregan columnas y tablas, y no renombran ni borran nada que use la versión anterior.

Para volver a una versión anterior: **Deployments → la publicación anterior → Promote to Production** (la base queda como está).

## 5. Backups

GitHub Actions corre `scripts/nube/backup.ts` todos los días a las 3:30 de Argentina (GitHub puede demorarlo un rato):

1. copia la base con `pg_dump`, de la misma versión que Neon, a `rrhh-AAAAMMDDTHHMMSSZ/base.dump` en `rrhh-backups`, y verifica que se pueda leer entera;
2. copia a `archivos/` los adjuntos que todavía no estaban, verificando el SHA-256 de cada uno contra la base (los adjuntos nunca cambian: cada uno se copia una sola vez y lo usan todos los backups);
3. escribe `SHA256SUMS`, que marca el backup como completo;
4. borra los backups de más de `BACKUP_RETENTION_DAYS` días (30) y los que quedaron a medias. Los adjuntos copiados no se borran.

Primero la base y después los archivos: un archivo se guarda antes que su registro, así que todo lo que figura en el dump queda copiado. Si falta un adjunto en el almacén de la aplicación o no coincide su SHA-256, el backup se cierra igual (la copia de la base sirve) pero queda registrado como fallido.

Al terminar, bien o mal, registra el resultado en la base (tabla `backup_run`) y el **Inicio** se lo muestra a quien administra los parámetros, como con Docker. El detalle está en **Actions → Backup en la nube → la corrida**.

Para un backup en el momento: **Actions → Backup en la nube → Run workflow → backup**.

> GitHub **desactiva** las tareas programadas de un repositorio público después de 60 días sin cambios en el repositorio. Si pasa, el Inicio avisa que el backup está atrasado: activalo de nuevo en **Actions → Backup en la nube → Enable workflow**.

Neon guarda además su propio historial (6 horas en el plan gratuito), que sirve para deshacer un error reciente (sección 7). Para una copia fuera de Vercel y de Neon, descargá cada tanto un `base.dump` desde **Storage → rrhh-backups** y guardalo cifrado como indica [operacion.md, sección 6.4](operacion.md#64-copia-fuera-del-servidor).

## 6. Prueba de restauración

Los domingos a las 4:30 GitHub Actions corre `scripts/nube/restore-test.ts`, que restaura el último backup completo en un PostgreSQL descartable de la misma versión que Neon, sin tocar la base ni los archivos de la aplicación, y verifica:

- la suma SHA-256 del dump;
- que el dump se restaure completo, sin errores;
- que tenga aplicadas las migraciones de la versión publicada (o menos, si es de una versión anterior);
- que la bitácora de auditoría siga protegida contra cambios;
- que cada archivo registrado en la base esté en `rrhh-backups` con su SHA-256.

Termina con una línea como `Prueba de restauración correcta para rrhh-20261012T063000Z: 15.230 filas, 412 archivos.` y registra el resultado para el Inicio. Para probar un backup en particular: **Run workflow → prueba de restauración**, con su nombre en el campo **backup**.

Si `pg_restore` falla, el log muestra solo su código de salida: el detalle puede traer datos de una fila y el log es público. Para verlo, seguí el paso de `pg_restore` de la sección 10.

## 7. Restauración

Primero, lo más simple: si el problema es reciente (un dato borrado o cambiado por error hace menos de 6 horas, o lo que permita el plan de Neon), usá la restauración de Neon (**Backup & Restore** en el proyecto), que vuelve la base a un momento anterior sin pasar por los backups.

Para restaurar un backup de `rrhh-backups`:

1. En Neon, creá una **base nueva y vacía** (por ejemplo, otra base en el mismo proyecto o un proyecto nuevo en São Paulo) y copiá su cadena de conexión **sin** pooling.
2. Cargala en GitHub como secreto `RESTORE_DIRECT_URL`.
3. **Actions → Restaurar backup de la nube → Run workflow**: el nombre del backup (vacío: el último) y `RESTAURAR` en la confirmación.

El script verifica la suma del dump, se niega si la base de destino tiene tablas, restaura el dump completo, **cierra todas las sesiones** que vienen con el backup y copia a `rrhh-archivos` los adjuntos que le falten (cada uno tiene un nombre único: no se pisa ni se borra ninguno). No toca la base en uso.

4. En Vercel, cambiá `DATABASE_URL` y `DIRECT_URL` por las de la base restaurada (con y sin pooling), y en GitHub el secreto `DIRECT_URL`. Volvé a publicar (**Deployments → … → Redeploy**): se aplican las migraciones pendientes si el backup es de una versión anterior.
5. Borrá el secreto `RESTORE_DIRECT_URL` y corré un backup y una prueba de restauración: la base restaurada no tiene los registros de los backups posteriores, y hasta entonces el Inicio puede mostrarlos como atrasados o fallidos.

Lo cargado después del backup se pierde. La base anterior queda en Neon hasta que la borres.

## 8. Recuperar el acceso de administrador

Si se pierde el acceso de todos los administradores (conviene tener siempre dos):

1. En GitHub, cargá los secretos `ADMIN_EMAIL` (el email del administrador) y `ADMIN_PASSWORD` (una contraseña provisoria que cumpla la política), y `DIRECT_URL` si todavía no está.
2. **Actions → Recuperar administrador → Run workflow**.
3. Ingresá: el sistema pide cambiar la contraseña. Después **borrá los secretos** `ADMIN_EMAIL` y `ADMIN_PASSWORD`.

Hace lo mismo que `npm run admin:recuperar` ([operacion.md, sección 12](operacion.md#12-recuperar-el-acceso-de-administrador)): restablece la contraseña (o crea el usuario si no existe), le da el rol Administrador, lo activa, lo desbloquea y cierra sus sesiones. El email no aparece en el log.

## 9. Diferencias con la instalación en un servidor

| Tema                       | Servidor propio (Docker)                | Vercel y Neon                                                 |
| -------------------------- | --------------------------------------- | ------------------------------------------------------------- |
| Archivos adjuntos          | Volumen `storage` del servidor          | Almacén privado de Vercel Blob (`STORAGE_DRIVER=vercel-blob`) |
| Migraciones y datos base   | Servicio `migrate` al levantar          | Al publicar, antes del build                                  |
| Backups                    | `scripts/backup.sh` con `cron`          | `scripts/nube/backup.ts` con GitHub Actions                   |
| Prueba de restauración     | `scripts/restore-test.sh`               | `scripts/nube/restore-test.ts`                                |
| Restauración               | Reemplaza la base del servidor          | En una base nueva, y se cambia la conexión                    |
| Recuperar el administrador | `npm run admin:recuperar` en la consola | Workflow **Recuperar administrador**                          |
| Límite de ingresos por IP  | nginx                                   | Regla del Firewall de Vercel                                  |
| HTTPS                      | nginx y Let's Encrypt                   | Vercel                                                        |
| Costo fijo                 | El servidor                             | Vercel Pro y, si hace falta, un plan de Neon                  |

El resto es igual: la misma aplicación, las mismas pantallas, permisos, auditoría y avisos.

## 10. Solución de problemas

| Síntoma                                                          | Qué revisar                                                                                                                                                                      |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| La publicación falla con "Falta DIRECT_URL"                      | La variable `DIRECT_URL` en Vercel, entorno Production.                                                                                                                          |
| La publicación falla en `prisma migrate deploy`                  | El log de la publicación. Que `DIRECT_URL` sea la conexión **sin** pooling.                                                                                                      |
| Todas las páginas dan error 500                                  | **Logs** del proyecto en Vercel: al iniciar, la aplicación dice qué variable falta o es inválida.                                                                                |
| "No se pudo subir el archivo" al cargar un documento             | Que `STORAGE_DRIVER` sea `vercel-blob` desde el build (si se agregó después, volvé a publicar) y que `rrhh-archivos` esté conectado al proyecto en Production.                   |
| El backup termina con "El backup en la nube no está configurado" | Faltan los secretos de la sección 3.6.                                                                                                                                           |
| El Inicio muestra el backup atrasado                             | **Actions → Backup en la nube**: si está desactivado (60 días sin cambios en el repositorio), activalo; si falló, el log dice en qué paso.                                       |
| Hay que ver un error de `pg_restore`                             | Descargá el `base.dump` de `rrhh-backups` y restauralo en una base propia con `pg_restore --no-owner --no-privileges`: el log de Actions no lo muestra porque puede traer datos. |

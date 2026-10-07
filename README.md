# RRHHPP — Sistema de Gestión de Personal

Aplicación web de gestión de personal para una PyME argentina: legajos, documentación, licencias, vacaciones, asistencia, remuneraciones informadas, novedades, egresos, reportes y auditoría.

> **Estado:** en desarrollo por fases. Fase actual: **2 — base del proyecto**. Los módulos se habilitan en el menú a medida que se entregan; los que todavía no existen aparecen deshabilitados con la fase en la que llegan.

- Diseño técnico aprobado: [docs/arquitectura.md](docs/arquitectura.md)
- El sistema **no** liquida sueldos ni emite comprobantes fiscales: registra la información que informa el sistema de liquidación de la empresa.

## Tecnologías

| Capa          | Tecnología                                                               |
| ------------- | ------------------------------------------------------------------------ |
| Aplicación    | Next.js 16 (App Router, Cache Components), React 19, TypeScript estricto |
| Estilos y UI  | Tailwind CSS 4, componentes con la convención de shadcn/ui               |
| Base de datos | PostgreSQL 16+, Prisma 7 con `@prisma/adapter-pg`                        |
| Validación    | Zod 4 (mensajes en español)                                              |
| Logs          | pino (JSON)                                                              |
| Tests         | Vitest (unitarios e integración contra PostgreSQL real)                  |
| Calidad       | ESLint, Prettier, GitHub Actions                                         |

## Requisitos

- Node.js 22.12 o superior (recomendado: 24 LTS)
- PostgreSQL 16 o superior, o Docker para levantarlo con `docker compose`

## Instalación

```bash
git clone https://github.com/poncio16/RRHHPP.git
cd RRHHPP
cp .env.example .env        # completar los valores
docker compose up -d db     # PostgreSQL de desarrollo (crea también la base de test)
npm install                 # instala dependencias y genera el cliente de Prisma
npm run db:deploy           # aplica las migraciones
npm run db:seed             # carga los datos de referencia
npm run dev                 # http://localhost:3000
```

Si usás un PostgreSQL propio en lugar de Docker, creá dos bases (`rrhh` y `rrhh_test`) con un usuario dueño de ambas y ajustá `DATABASE_URL` y `TEST_DATABASE_URL`. Las extensiones `pg_trgm` y `unaccent` las crea la primera migración (son extensiones "trusted" desde PostgreSQL 13).

## Variables de entorno

| Variable                                  | Uso                                                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`                            | Conexión a PostgreSQL.                                                                                 |
| `TEST_DATABASE_URL`                       | Base usada por los tests de integración. **Se borra en cada corrida**; nunca apuntarla a datos reales. |
| `APP_URL`                                 | URL pública de la aplicación.                                                                          |
| `STORAGE_DIR`                             | Carpeta de archivos adjuntos (persistente en producción).                                              |
| `LOG_LEVEL`                               | `fatal`, `error`, `warn`, `info`, `debug` o `trace`.                                                   |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | Administrador inicial que crea el seed si todavía no existe. Debe cambiar la contraseña al ingresar.   |
| `TRUSTED_PROXY`                           | `true` solo detrás de un proxy inverso que envía la IP real (`X-Real-IP` / `X-Forwarded-For`).         |

La aplicación valida las variables al arrancar y se detiene con un mensaje claro si falta alguna.

## Comandos

| Comando                           | Qué hace                                                |
| --------------------------------- | ------------------------------------------------------- |
| `npm run dev`                     | Servidor de desarrollo.                                 |
| `npm run build` / `npm start`     | Build y ejecución de producción.                        |
| `npm run lint`                    | ESLint.                                                 |
| `npm run typecheck`               | Genera los tipos de rutas y verifica TypeScript.        |
| `npm run format` / `format:check` | Prettier.                                               |
| `npm test`                        | Todos los tests (unitarios + integración).              |
| `npm run test:unit`               | Solo unitarios (no necesitan base de datos).            |
| `npm run test:integration`        | Integración contra `TEST_DATABASE_URL`.                 |
| `npm run db:migrate`              | Crea y aplica una migración nueva en desarrollo.        |
| `npm run db:deploy`               | Aplica migraciones pendientes (producción y CI).        |
| `npm run db:seed`                 | Carga datos iniciales. Se puede repetir sin duplicar.   |
| `npm run check`                   | Lint, tipos, formato y tests: lo mismo que verifica CI. |

## Estructura

```
prisma/            schema, migraciones y seed
src/app/           rutas (App Router): solo presentación
src/features/      un módulo por dominio: repository → service → actions/UI
src/server/        infraestructura de servidor: db, env, errores, logs (y luego auth, auditoría, storage)
src/components/    UI reutilizable (ui/, layout/)
src/lib/           utilidades puras: validadores AR (DNI, CUIL, CBU), formato de fechas e importes
tests/             unit/ e integration/
docs/              arquitectura y operación
```

Reglas: los componentes no acceden a la base; las consultas viven en `features/*/repository.ts`; las reglas de negocio en `features/*/service.ts`; todo lo de `src/server` y los repositorios importa `server-only`.

## Healthcheck

`GET /api/health` responde `200 {"status":"ok"}` si la base está disponible y `503` si no.

## Usuarios y roles

El seed crea los cuatro roles iniciales (solo si no existen) y un administrador con el email y la contraseña de `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD`. Al primer ingreso el sistema obliga a cambiar esa contraseña.

| Rol            | Alcance inicial                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------- |
| Administrador  | Todos los permisos, siempre. No se puede editar ni quedar el sistema sin un administrador activo. |
| RRHH           | Gestión completa del personal; no administra usuarios, parámetros generales ni ve la auditoría.   |
| Administración | Lectura de legajos, datos bancarios, salariales, novedades y reportes autorizados; exportación.   |
| Consulta       | Lectura de legajos básicos, licencias y asistencia; reporte de dotación.                          |

Los permisos de RRHH, Administración y Consulta se ajustan en **Usuarios y permisos → Roles y permisos**. Desde **Usuarios** se dan de alta usuarios (con contraseña temporal que se muestra una sola vez), se cambian roles, se desactivan, se blanquean contraseñas, se desbloquean y se cierran sus sesiones.

## Configuración

En **Configuración** (roles Administrador y RRHH) se administra lo que después usan los legajos:

- **Catálogos**: sectores, puestos, establecimientos, convenios, categorías, tipos de contrato, tipos de jornada, obras sociales, ART, bancos y listas simples (estado civil, nacionalidad, modalidad, tipos de cuenta, tipos y motivos de egreso). Nada se borra: un elemento se desactiva y deja de ofrecerse, pero sigue en los registros que ya lo usan.
- **Horarios**: días y horas de cada turno; las horas semanales se calculan solas.
- **Feriados**: se cargan por año según el calendario oficial. El seed no trae feriados porque cambian cada año.
- **Empresa** y **Parámetros** (solo Administrador): razón social, CUIT, domicilio, valores sugeridos para legajos nuevos y parámetros de seguridad.

El seed carga una empresa ficticia (Distribuidora Demo S.A.) y catálogos de demostración. Los bancos son reales porque su código de entidad valida el CBU: conviene verificarlos con el listado del BCRA antes de usar el sistema en producción.

## Empleados

En **Empleados** está el listado de legajos con búsqueda (nombre y apellido sin importar acentos ni mayúsculas, número de legajo y, para quien puede ver datos personales, DNI o CUIL), filtros por estado, sector y establecimiento, y orden por apellido, legajo o ingreso. El buscador del encabezado lleva al mismo listado.

- **Alta y edición**: datos personales, de contacto y laborales. El número de legajo se asigna solo si se deja vacío. DNI, CUIL y CBU se validan con su dígito verificador; si el CUIL no corresponde al DNI se muestra un aviso, pero no se bloquea (hay casos reales en que no coinciden).
- **Historial laboral**: los cambios de puesto, sector, categoría, convenio, contratación, jornada, horario, modalidad, establecimiento y superior directo piden una fecha de vigencia (no futura) y quedan en el historial con quién los registró.
- **Datos bancarios**: la cuenta sueldo se carga aparte; el banco se reconoce por el CBU y los cambios quedan en el historial con el CBU enmascarado.
- **Alcance por permisos**: sin "Ver datos personales" el servidor no envía DNI, CUIL, domicilio ni nacimiento, y no se puede buscar por documento; sin "Ver datos bancarios" no se ven la pestaña ni los cambios bancarios del historial. Para crear o editar legajos hacen falta "Crear y modificar legajos" y "Ver datos personales".
- Si dos personas editan el mismo legajo a la vez, la segunda en guardar recibe un aviso para recargar en lugar de pisar los cambios.

El seed carga 24 empleados ficticios con documentos y CBU inventados (con dígitos verificadores válidos) y dos cambios de categoría de ejemplo. No pisa legajos existentes.

## Seguridad

- **Sesiones** en base de datos: la cookie (`httpOnly`, `SameSite=Lax`, `Secure` en producción) lleva un token aleatorio de 256 bits; en la base solo se guarda su hash SHA-256. Vencen por inactividad y por duración máxima.
- **Contraseñas** con Argon2id. Mensaje de error genérico en el login y bloqueo temporal tras varios intentos fallidos.
- Inactividad, duración máxima, intentos, minutos de bloqueo y largo mínimo de contraseña son parámetros (`Setting` `security`), no constantes del código.
- **Permisos validados en el servidor** en cada página, server action y endpoint; el menú solo oculta lo que el rol no puede usar. Un acceso denegado queda auditado.
- **Auditoría** de ingresos (exitosos y fallidos), cierres de sesión, cambios de contraseña, altas y cambios de usuarios y de permisos. La tabla `audit_log` es de solo inserción (trigger en la base); nunca guarda contraseñas ni tokens y enmascara el CBU.
- Secretos solo por `.env` (nunca versionado), validación de variables al iniciar, restricciones `CHECK` sobre fechas, importes y formatos, y logs que ocultan contraseñas, tokens y CBU.

La revisión de seguridad completa (cabeceras, límites de tasa, dependencias) es la Fase 15.

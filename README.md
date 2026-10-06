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
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | Administrador inicial (se usan desde la Fase 3).                                                       |

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

## Seguridad

Se completa en las fases 3 (autenticación, roles y permisos, auditoría) y 15 (revisión de seguridad). Lo que ya está en esta fase: secretos solo por `.env` (nunca versionado), validación de variables al iniciar, tabla de auditoría inmutable a nivel base de datos (trigger), restricciones `CHECK` sobre fechas, importes y formatos, y logs que ocultan contraseñas, tokens y CBU.

Usuarios iniciales y roles: se documentan al entregar la Fase 3.

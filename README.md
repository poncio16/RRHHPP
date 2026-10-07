# RRHHPP — Sistema de Gestión de Personal

Aplicación web de gestión de personal para una PyME argentina: legajos, documentación, licencias, vacaciones, asistencia, remuneraciones informadas, novedades, egresos, reportes y auditoría.

> **Estado:** en desarrollo por fases. Fase actual: **9 — información salarial y novedades**. Los módulos se habilitan en el menú a medida que se entregan; los que todavía no existen aparecen deshabilitados con la fase en la que llegan.

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

## Documentación

En **Documentación** (menú) se ven los documentos de todos los legajos y en la pestaña **Documentación** de cada legajo, los de ese empleado. Se puede buscar por empleado o legajo y filtrar por tipo, estado y vencimiento (vencidos, por vencer, vigentes, sin vencimiento).

- **Tipos de documento**: se administran en Configuración → Catálogos. Cada tipo indica si tiene vencimiento obligatorio, una vigencia habitual opcional (sugiere el vencimiento a partir de la emisión), la anticipación del aviso y si es **sensible** (datos de salud). El seed carga los tipos del relevamiento sin vigencias ni anticipaciones: dependen de cada empresa.
- **Vencimientos**: un documento es válido hasta su fecha de vencimiento inclusive y figura "por vencer" cuando faltan los días de anticipación del tipo o, si no tiene, los de Parámetros → Documentación.
- **Archivos**: PDF, PNG o JPG, hasta el tamaño configurado en Parámetros (tope técnico 20 MB). El tipo se verifica por el contenido, el archivo se guarda en `STORAGE_DIR` con un nombre interno aleatorio y su hash SHA-256, y nunca se sirve en forma pública: se descarga por una ruta que verifica la sesión y los permisos, y cada descarga queda en la auditoría.
- **Nada se borra**: un documento se anula con un motivo y deja de contar para los vencimientos. Al reemplazar el archivo, el anterior queda guardado.
- **Permisos**: "Ver documentación" para consultar y descargar, "Registrar documentación" para cargar, editar y anular, y "Ver datos de salud" para los tipos marcados como sensibles (sin ese permiso no aparecen ni se pueden descargar).

En producción, `STORAGE_DIR` tiene que ser un volumen persistente incluido en los backups junto con la base de datos.

## Licencias, ausencias y vacaciones

En **Licencias y ausencias** (menú) se registran licencias, ausencias, vacaciones y suspensiones de todo el personal; la pestaña **Licencias y vacaciones** de cada legajo muestra las del empleado y sus saldos. **Vacaciones** reúne las solicitudes de vacaciones y los saldos por período.

- **Tipos**: se administran en Configuración → Catálogos → Tipos de licencia y ausencia. Cada tipo tiene una clase (licencia, ausencia, vacaciones o suspensión, que no se cambia una vez creado), cómo se cuentan los días (corridos u hábiles), si es con goce, si requiere certificado, topes opcionales por vez y por año, si cuenta para el ausentismo y si es un **dato de salud**. El seed carga los tipos del relevamiento con días corridos y sin topes: hay que revisarlos con el asesor laboral.
- **Días**: corridos cuenta todos los días entre las dos fechas inclusive. Hábiles cuenta los días que el empleado trabaja según su horario (sin horario asignado, los primeros N días de la semana de Parámetros → Licencias) y descuenta los feriados, salvo los no laborables optativos.
- **Estados**: un registro nace solicitado (o aprobado, si quien lo carga puede aprobar) y se aprueba o rechaza con motivo. Se anula con un motivo; nada se borra. No puede superponerse con otro registro solicitado o aprobado del mismo empleado. Superar un tope o el saldo da un aviso al cargar; al aprobar, el saldo insuficiente bloquea.
- **Certificados**: si el tipo lo requiere, la lista marca "Falta certificado" hasta que se adjunta un documento desde el mismo registro.
- **Suspendido**: no se guarda a mano; un empleado figura suspendido mientras tiene una suspensión aprobada que cubre el día de hoy (se ve en el legajo y como filtro en Empleados).
- **Saldos de vacaciones**: uno por empleado y año. Los días se calculan con las reglas por antigüedad de Configuración → Vacaciones y los parámetros de Parámetros → Vacaciones (fecha de corte de la antigüedad y proporción cuando no se trabajó lo suficiente). "Generar períodos" muestra el cálculo antes de crear los que faltan; los existentes no cambian. Cada período admite un ajuste con motivo y días arrastrados. Las reglas y parámetros del seed son los valores de referencia de la LCT y deben validarse.
- **Permisos**: "Ver licencias, ausencias y vacaciones" para consultar, "Registrar licencias, ausencias y vacaciones" para cargar, editar y anular solicitudes y generar o ajustar saldos, "Aprobar o rechazar solicitudes" para decidir y editar aprobadas, y "Ver datos de salud" para ver los tipos marcados como dato de salud (sin ese permiso se muestran como "Licencia (dato reservado)", sin observaciones ni acciones).

Las licencias generan novedades si su tipo tiene configurado "Genera novedad" (ver Novedades). Los indicadores de ausentismo y las alertas llegan con la Fase 11.

## Asistencia

En **Asistencia** (menú) la **Planilla diaria** muestra, para un día, a todo el personal en funciones con lo que se esperaba (turno del horario, franco, feriado o licencia) y permite cargar entrada, salida, descanso u "ausente" de varios empleados a la vez; se guardan juntas solo las filas modificadas, y si alguna tiene un problema no se guarda ninguna. **Registros** lista los días cargados con filtros (presentes, ausentes, llegadas tarde, horas adicionales, con licencia, francos y feriados) y totales. La pestaña **Asistencia** de cada legajo muestra el mes del empleado.

- **Estado del día**: se deriva, no se elige. Con una licencia aprobada que cubre el día queda "Con licencia" y no admite horarios; con entrada y salida, "Presente"; sin horarios, "Franco" o "Feriado" según el horario y el calendario, o "Ausente" en un día de trabajo.
- **Horas**: trabajadas = de la entrada a la salida menos el descanso (por defecto, el del horario de ese día). En un día del horario, las normales llegan hasta lo previsto y el excedente es adicional; la llegada tarde cuenta todos los minutos después del inicio del turno. Un franco o feriado trabajado es todo adicional; un empleado sin horario asignado tiene todo como normal y sin llegadas tarde. Una salida igual o anterior a la entrada es del día siguiente.
- **Parámetros** (Configuración → Parámetros → Asistencia): tolerancia de llegada tarde y mínimo de minutos para contar horas adicionales. Ambos arrancan en 0; definirlos con la política de la empresa o el convenio.
- **Licencias**: no se puede aprobar una licencia sobre días con presencia cargada; al aprobar, editar o anular una licencia aprobada se actualizan los días ya cargados sin horarios.
- **Límites**: no se cargan días futuros ni fuera del período en que el empleado trabajó en la empresa. Las horas se interpretan en la zona horaria de Buenos Aires.
- **Permisos**: "Ver asistencia y horarios" para consultar y "Registrar asistencia" para cargar y corregir.

La carga es manual. La importación desde relojes o archivos de fichadas queda preparada (cada día guarda su origen) pero no está implementada. Las horas adicionales, llegadas tarde y ausencias se convierten en novedades desde Novedades → Generar novedades. El ausentismo y las alertas llegan con la Fase 11.

## Información salarial

En **Información salarial** (menú) están los **resúmenes informados** de cada mes y los **básicos vigentes** de todo el personal; la pestaña **Remuneraciones** de cada legajo muestra el historial del empleado. Es un registro administrativo de lo que informa el sistema de liquidación de la empresa: **no constituye liquidación de haberes** y el sistema no calcula sueldos.

- **Básicos**: cada cambio de básico se registra con la fecha desde la que rige (no futura y dentro del período de empleo). El vigente es el de fecha más reciente hasta hoy. Al corregir uno se cambian importe y observaciones; la fecha no.
- **Resúmenes**: uno por empleado y mes, con bruto, descuentos y neto informados y, opcionalmente, renglones por concepto (sueldo básico, adicionales, horas extras, premios, descuentos, etc.; se administran en Configuración → Catálogos → Conceptos salariales). Si los totales no cierran con los renglones o el neto no es bruto menos descuentos, se avisa pero se guarda igual; la lista permite ver solo los que tienen diferencias.
- **Importes**: se aceptan con coma decimal y puntos de miles ("1.234.567,89").
- **Permisos**: "Ver información salarial" para consultar y "Registrar información salarial" para cargar y corregir.

Los datos salariales del seed son ficticios.

## Novedades

**Novedades** (menú) es la bandeja de lo que hay que pasar al sistema de liquidación en cada mes; la pestaña **Novedades** de cada legajo muestra las del empleado. Tipos: adelantos, bonificaciones, descuentos, horas extras, ausencias, llegadas tarde, cambios de categoría y salariales, premios, sanciones y otros (Configuración → Catálogos → Tipos de novedad).

- **Manuales**: se cargan con empleado, fecha, tipo, período, importe o cantidad cuando el tipo lo pide, y observaciones. Queda registrado quién la cargó.
- **Generadas**: "Generar novedades" arma las del mes a partir de las licencias aprobadas (si su tipo tiene "Genera novedad"), la asistencia (horas extras, llegadas tarde y ausencias del mes), los cambios de básico y los cambios de categoría, según el campo "Se genera desde" de cada tipo de novedad. Antes de aplicar muestra qué crea, recalcula o anula. Se puede repetir: lo que cambió vuelve a pendiente, lo informado no se toca y lo anulado a mano no se recrea.
- **Estados**: pendiente → aprobada → informada (después de cargarla en el sistema de liquidación; se puede desmarcar). Se anulan con un motivo; nada se borra. Solo las manuales se editan, y editar una aprobada la devuelve a pendiente. Los botones de aprobar y marcar informadas en bloque actúan sobre el mes y los filtros a la vista.
- **Permisos**: "Ver novedades", "Registrar novedades" (cargar, editar, aprobar, anular y generar) y "Marcar novedades como informadas". Sin "Ver información salarial", las novedades de cambios salariales se muestran sin importe.

La exportación de novedades a CSV llega con los reportes de la Fase 12.

## Seguridad

- **Sesiones** en base de datos: la cookie (`httpOnly`, `SameSite=Lax`, `Secure` en producción) lleva un token aleatorio de 256 bits; en la base solo se guarda su hash SHA-256. Vencen por inactividad y por duración máxima.
- **Contraseñas** con Argon2id. Mensaje de error genérico en el login y bloqueo temporal tras varios intentos fallidos.
- Inactividad, duración máxima, intentos, minutos de bloqueo y largo mínimo de contraseña son parámetros (`Setting` `security`), no constantes del código.
- **Permisos validados en el servidor** en cada página, server action y endpoint; el menú solo oculta lo que el rol no puede usar. Un acceso denegado queda auditado.
- **Auditoría** de ingresos (exitosos y fallidos), cierres de sesión, cambios de contraseña, altas y cambios de usuarios y de permisos. La tabla `audit_log` es de solo inserción (trigger en la base); nunca guarda contraseñas ni tokens y enmascara el CBU.
- Secretos solo por `.env` (nunca versionado), validación de variables al iniciar, restricciones `CHECK` sobre fechas, importes y formatos, y logs que ocultan contraseñas, tokens y CBU.

La revisión de seguridad completa (cabeceras, límites de tasa, dependencias) es la Fase 15.

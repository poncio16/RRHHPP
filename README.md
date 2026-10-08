# RRHHPP — Sistema de Gestión de Personal

Aplicación web de gestión de personal para una PyME argentina: legajos, documentación, licencias, vacaciones, asistencia, remuneraciones informadas, novedades, egresos, reportes y auditoría.

> **Estado:** en desarrollo por fases. Fase actual: **15 — pruebas, seguridad y optimización**. Los módulos se habilitan en el menú a medida que se entregan; los que todavía no existen aparecen deshabilitados con la fase en la que llegan.

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
| `TRUSTED_PROXY`                           | `true` detrás de un proxy inverso que fija `X-Real-IP` o agrega la IP a `X-Forwarded-For`.             |

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
| `npm run test:e2e`                | Pruebas de punta a punta en el navegador (Playwright).  |
| `npm run db:migrate`              | Crea y aplica una migración nueva en desarrollo.        |
| `npm run db:deploy`               | Aplica migraciones pendientes (producción y CI).        |
| `npm run db:seed`                 | Carga datos iniciales. Se puede repetir sin duplicar.   |
| `npm run check`                   | Lint, tipos, formato y tests: lo mismo que verifica CI. |

### Pruebas de punta a punta

Recorren en Chromium los flujos principales sobre la app compilada: login (y rechazo de credenciales), alta de un empleado, DNI repetido, licencia, egreso confirmado, auditoría del alta, cabeceras de seguridad y que las pantallas principales no se desborden en un celular.

```bash
npx playwright install chromium   # una sola vez
npm run build
npm run test:e2e                   # levanta `next start` en el puerto 3100
```

Usan la base de `DATABASE_URL` (la de desarrollo, con el seed cargado) y crean empleados de prueba con DNI 4xxxxxxx. Variables opcionales:

| Variable           | Uso                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| `E2E_EMAIL`        | Usuario con el que ingresan. Por defecto, `SEED_ADMIN_EMAIL`.                                   |
| `E2E_PASSWORD`     | Su contraseña. Por defecto, `SEED_ADMIN_PASSWORD`.                                              |
| `E2E_NEW_PASSWORD` | Si el usuario todavía tiene que cambiar la contraseña inicial, las pruebas la cambian por esta. |
| `E2E_BASE_URL`     | Probar contra una app ya levantada en lugar de iniciar una.                                     |
| `E2E_PORT`         | Puerto de la app que levantan las pruebas (3100 por defecto).                                   |

Nunca las corras contra una base con datos reales: dan de alta y egresan empleados de prueba.

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

Las novedades del período, con los filtros de la pantalla, se exportan a Excel o CSV desde los botones de arriba (permiso "Exportar listados y reportes"), para cargarlas en el sistema de liquidación.

## Egresos e historial

En **Egresos** (menú) se registran y siguen las bajas de todo el personal; la pestaña **Historial** de cada legajo muestra sus egresos y una línea de tiempo con todo lo que pasó.

- **Egreso**: se registra con fecha (último día de trabajo), tipo, motivo y observaciones, y queda **en trámite** (por ejemplo, durante un preaviso). Se confirma desde el día de egreso en adelante, o en el mismo paso si la fecha ya llegó. Al confirmar, el empleado pasa a **egresado**: el legajo no se borra y conserva toda su información. Tipos y motivos se administran en Configuración → Catálogos.
- **Antes de confirmar**: si hay licencias, asistencia, básicos, resúmenes o novedades posteriores a la fecha de egreso, el sistema avisa cuáles son y no confirma hasta que se corrijan en su módulo. También avisa (sin bloquear) si el empleado tiene personal a cargo o un usuario del sistema activo.
- **Documentación**: se pueden adjuntar documentos al egreso (renuncia, telegrama, constancias); quedan en la documentación del legajo.
- **Anulación**: con motivo. Anular el egreso confirmado vigente devuelve al empleado a activo; un egreso anterior a un reingreso queda como historial y no se anula.
- **Reingreso**: un egresado vuelve sobre el **mismo legajo** con una nueva fecha de ingreso, posterior al último egreso y no futura. La antigüedad se cuenta desde el reingreso salvo que se indique otra fecha de antigüedad reconocida. El cambio queda en el historial laboral; puesto, sector y demás datos se ajustan después en "Editar legajo".
- **Línea de tiempo**: une ingreso, cambios laborales, básicos, licencias aprobadas, egresos y reingresos, del más reciente al más antiguo y con filtro por tipo. Cada parte se muestra solo con el permiso de su módulo; las licencias marcadas como dato de salud aparecen como "Licencia (dato reservado)".
- **Permisos**: "Ver egresos" para consultar y "Registrar egresos y reingresos" para cargar, confirmar, anular y reingresar.

Los egresos del seed son ficticios: uno confirmado y uno en trámite. Los egresos del mes se ven en el inicio y en el reporte de altas y bajas.

## Inicio

El **Inicio** muestra indicadores calculados en el momento con los datos cargados. Cada bloque aparece solo si el rol tiene el permiso del módulo de donde sale el dato.

- **Hoy**: personal activo (con suspendidos hoy, egresados y total de legajos), antigüedad promedio desde la fecha de antigüedad reconocida, licencias en curso, días de vacaciones pendientes (períodos hasta el año actual) y alertas pendientes.
- **Movimientos del mes**: se elige el mes con las flechas (no hay meses futuros). Ingresos (fecha de ingreso o reingreso en el mes), egresos confirmados y ausentismo, con sus listas.
- **Ausentismo** = días de trabajo perdidos ÷ días de trabajo previstos. Pierden días las ausencias cargadas en asistencia y las licencias aprobadas de tipos marcados "Cuenta para el ausentismo" (Configuración → Catálogos → Tipos de licencia); un mismo día cuenta una vez. Los días previstos son los hábiles de cada persona según su horario (o los días por defecto de Parámetros → Licencias), sin feriados y dentro de su período de empleo. En el mes en curso se mide hasta hoy.
- **Distribución** del personal activo por sector, puesto, tipo de contratación y modalidad de trabajo, en barras con cantidad y porcentaje.
- **En curso y próximos**: licencias en curso, próximas vacaciones, documentos por vencer y cumpleaños (estas tres según la anticipación de las alertas), y las alertas pendientes por tipo.

## Alertas

**Alertas** (menú) lista los avisos del día. No hay tareas programadas ni correos: se calculan cada vez que se abre la pantalla o el inicio.

| Alerta                                   | Cuándo aparece                                                                                                                                                         | Permiso para verla   |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Documentos por vencer o vencidos         | Según la anticipación del tipo de documento o la general (Parámetros → Documentación). Un documento renovado (otro del mismo tipo con vencimiento posterior) no avisa. | Ver documentación    |
| Licencias que terminan                   | Licencias aprobadas (no vacaciones) que terminan dentro de la anticipación.                                                                                            | Ver licencias        |
| Vacaciones próximas                      | Vacaciones aprobadas que empiezan dentro de la anticipación.                                                                                                           | Ver licencias        |
| Vacaciones pendientes de años anteriores | Períodos de años anteriores con días sin tomar.                                                                                                                        | Ver licencias        |
| Contratos a plazo que terminan           | Fecha de fin de contrato dentro de la anticipación o ya pasada.                                                                                                        | Ver empleados        |
| Cumpleaños                               | Dentro de la anticipación.                                                                                                                                             | Ver datos personales |
| Legajos incompletos                      | Falta horario, obra social, ART y, según lo que se pueda ver, teléfono o email, contacto de emergencia, cuenta sueldo o sueldo básico.                                 | Ver empleados        |

- **Anticipación**: en Configuración → Parámetros → Alertas (días para licencias, vacaciones, cumpleaños y contratos; 0 desactiva el aviso).
- **Posponer 7 días** o **Descartar**: vale para todos los usuarios y queda en la auditoría. Se puede volver a pendientes desde los filtros "Pospuestas" y "Descartadas". Si cambia el dato que originó el aviso (por ejemplo, una nueva fecha de vencimiento), es una alerta nueva y vuelve a aparecer. Hace falta el permiso de escritura del módulo de origen.
- Los datos de salud se muestran como reservados sin el permiso "Ver documentación sensible".

## Reportes y exportación

**Reportes** (menú) reúne siete reportes calculados en el momento con los datos cargados. Cada uno tiene filtros que quedan en la URL (sector, puesto, establecimiento y, según el reporte, fechas, mes o período) y muestra arriba qué se está mirando. Los filtros de estructura usan la asignación actual de cada persona.

| Reporte                   | Qué muestra                                                                                                                                                        | Permiso                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| Dotación                  | Personal activo por sector, puesto, categoría y establecimiento, y el detalle.                                                                                     | Reporte de dotación                                  |
| Altas y bajas             | Evolución mensual (altas, bajas y dotación al cierre), ingresos y reingresos, y egresos confirmados de un rango de meses (por defecto, los últimos doce).          | Reporte de altas y bajas                             |
| Ausentismo                | Días de ausencia sobre días previstos por empleado, por sector y por tipo, entre dos fechas (por defecto, el mes en curso hasta hoy). Mismo cálculo que el inicio. | Reporte de ausentismo                                |
| Vacaciones                | Por empleado y por sector: corresponden, ajuste, arrastre, disponibles, utilizados, solicitados y pendientes de un período.                                        | Reporte de vacaciones                                |
| Vencimientos              | Documentos (marcando los renovados), licencias que terminan y contratos a plazo entre dos fechas (por defecto, los próximos 60 días).                              | Reporte de vencimientos                              |
| Antigüedad                | Personal activo por rangos y el detalle, a una fecha. Los rangos se ajustan en Configuración → Parámetros → Rangos de antigüedad.                                  | Reporte de antigüedad                                |
| Remuneraciones informadas | Bruto, descuentos y neto informados de un mes, por sector y por empleado, con el aviso "no constituye liquidación de haberes".                                     | Reporte de remuneraciones y Ver información salarial |

- **Exportar**: con el permiso "Exportar listados y reportes", cada reporte se descarga en **Excel** (una hoja por tabla, con fechas y números reales) y cada tabla en **CSV**. También se exportan los listados de **Empleados** y **Novedades** con los filtros de la pantalla. DNI y CUIL salen solo con permiso de datos personales, y los datos de salud siguen reservados.
- **CSV**: separador punto y coma, coma decimal, fechas dd/mm/aaaa y codificación UTF-8 con BOM, para que Excel en español lo abra directo. Los textos que empiezan con `=`, `+`, `-` o `@` se exportan con un apóstrofo adelante para que no se tomen como fórmulas.
- Cada exportación queda en la auditoría con el reporte, el formato, los filtros y la cantidad de filas. Los listados exportan hasta 10.000 filas.

## Importación de empleados

**Importar** (menú) da de alta legajos nuevos desde un Excel o un CSV. Hace falta el permiso "Importar empleados" y, como en el alta manual, "Crear y modificar legajos" y "Ver datos personales" (por defecto, Administrador y RRHH).

1. **Plantilla**: "Descargar plantilla" baja un Excel con la hoja **Empleados** (encabezados; los obligatorios resaltados), **Instrucciones** (formato de cada columna) y **Valores** (los nombres activos de cada catálogo, tal como hay que escribirlos). Se acepta también un CSV con los mismos encabezados, separado por `;`, `,` o tabulación, en UTF-8 o en la codificación de Excel en Windows.
2. **Validación**: al subir el archivo se revisa la estructura (columnas obligatorias, repetidas o desconocidas) y cada fila con las mismas reglas del alta manual: DNI y CUIL con dígito verificador, fechas dd/mm/aaaa, catálogos por nombre (sin distinguir mayúsculas ni acentos; la provincia también por código), superior por número de legajo activo, fin de contrato si el tipo lo exige y categoría del convenio. Hasta 500 filas y 2 MB por archivo.
3. **Vista previa**: muestra cada fila como válida, con errores (con la columna y el motivo) o duplicada. Es **duplicada** si el DNI, el CUIL o el legajo ya existen en el sistema (activo o no) o se repiten en otra fila del archivo: **nunca se modifica un legajo existente**. Todavía no se creó nada.
4. **Confirmar o descartar**: se puede importar solo las filas válidas o descartar, corregir el archivo y volver a subirlo. Al confirmar se crean todos los legajos válidos en una sola transacción, o ninguno si algo cambió desde la validación (por ejemplo, alguien cargó a la misma persona); en ese caso hay que volver a subir el archivo.

Cada alta queda en la auditoría como un alta más, marcada "(importación)", y la confirmación como `IMPORT` con el archivo y la cantidad de filas; descartar también queda registrado. Las importaciones recientes se listan con su estado; al cerrarse, el lote deja de guardar los datos completos de cada fila y conserva solo nombre, DNI, estado, observaciones y el legajo creado.

## Auditoría

**Auditoría** (menú, permiso "Ver auditoría"; por defecto solo Administrador) muestra la bitácora completa, del evento más reciente al más antiguo: altas, modificaciones, bajas lógicas, inicios y cierres de sesión (también los fallidos), cambios de usuarios y permisos, accesos denegados, exportaciones, importaciones y descargas de archivos.

- **Filtros**: búsqueda en el detalle o el email, rango de fechas (días completos en la hora de Argentina), módulo, acción, resultado (correcto, fallido o denegado) y usuario. Quedan en la URL y se combinan. Desde el historial de un legajo, "Cambios del legajo en auditoría" abre los eventos de ese empleado.
- **Detalle**: fecha y hora, usuario, módulo, registro afectado (con enlace a empleados, usuarios e importaciones), IP y navegador. En una modificación se ven los campos que cambiaron con su valor anterior y nuevo; en un alta, los datos registrados. Sectores, puestos, catálogos y empleados se muestran por su nombre actual.
- **Exportar**: con "Exportar listados y reportes", los eventos filtrados se descargan en Excel o CSV (hasta 10.000, sin el detalle campo por campo). La exportación también queda en la auditoría.
- Nada se puede modificar ni borrar: la tabla es de solo inserción. Las contraseñas y tokens nunca se registran y el CBU queda enmascarado. Quien ve la auditoría ve los valores de todos los módulos, incluidos datos personales y salariales, por eso el permiso es solo del Administrador.

## Seguridad

- **Sesiones** en base de datos: la cookie (`httpOnly`, `SameSite=Lax`, `Secure` en producción) lleva un token aleatorio de 256 bits; en la base solo se guarda su hash SHA-256. Vencen por inactividad y por duración máxima.
- **Contraseñas** con Argon2id. El login responde lo mismo para email inexistente, contraseña incorrecta, usuario inactivo o cuenta bloqueada. Tras varios intentos fallidos la cuenta se bloquea un tiempo; el intento se cuenta antes de verificar la contraseña, así varios pedidos simultáneos no prueban más claves que las permitidas.
- Inactividad, duración máxima, intentos, minutos de bloqueo y largo mínimo de contraseña son parámetros (`Setting` `security`), no constantes del código.
- **Permisos validados en el servidor** en cada página, server action y endpoint; el menú solo oculta lo que el rol no puede usar. Un acceso denegado queda auditado. Los datos personales, bancarios, salariales y de salud se ocultan también en avisos, totales y datos de formularios, no solo en las columnas.
- **Cabeceras** en todas las respuestas: `Content-Security-Policy` (solo recursos propios, sin `eval` en producción, sin marcos), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Permissions-Policy` y, fuera de desarrollo, `Strict-Transport-Security`. La CSP admite scripts en línea porque las páginas estáticas no llevan nonce; el código no inserta HTML sin escapar.
- **Archivos**: tipo reconocido por su contenido, tamaño máximo, nombres de almacenamiento aleatorios y descargas como adjunto. Un Excel a importar se controla descomprimido (hasta 10 MB) y solo se leen celdas con datos.
- **Auditoría** de ingresos (exitosos y fallidos), cierres de sesión, cambios de contraseña, altas y cambios de usuarios y de permisos. La tabla `audit_log` es de solo inserción (trigger en la base); nunca guarda contraseñas ni tokens y enmascara el CBU. La IP es la que informa el proxy inverso; sin proxy, el cliente la puede falsear, por eso en producción la app va detrás de uno con `TRUSTED_PROXY=true`.
- Secretos solo por `.env` (nunca versionado), validación de variables al iniciar, restricciones `CHECK` sobre fechas, importes y formatos, y logs que ocultan contraseñas, tokens y CBU.
- **Límite de pedidos por IP**: la app limita los intentos por cuenta, no por IP. El límite por IP se configura en el proxy inverso (la Fase 16 documenta un ejemplo).
- **Dependencias**: `npm audit --omit=dev` reporta avisos en `prisma` (solo la línea de comandos, con controladores que la app no usa) y en `uuid` dentro de `exceljs` (una función que ExcelJS no llama). Ninguno es alcanzable desde la app; las correcciones que ofrece npm son versiones anteriores incompatibles.

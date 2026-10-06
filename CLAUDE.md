@AGENTS.md

# Convenciones del proyecto

- Leé `docs/arquitectura.md` antes de cambiar el modelo de datos o agregar un módulo. Respetá las decisiones aprobadas en su sección 10.
- Idioma: interfaz, mensajes de error, documentación y commits en español. Código (identificadores) en inglés.
- Capas: `src/app` (presentación) → `features/*/actions.ts` o `app/api/**` (adaptadores) → `features/*/service.ts` (reglas, transacciones, auditoría) → `features/*/repository.ts` (único lugar con Prisma).
- Importá `z` desde `@/lib/zod` (mensajes en español), no desde `zod`.
- Fechas de calendario son `DATE` (medianoche UTC): formatealas con `@/lib/format`, nunca con `toLocaleDateString` sin zona.
- Importes: `Decimal(14,2)`; nunca `float`.
- No borrar datos de personal: baja lógica, estados e historial. `audit_log` es de solo inserción.
- Nada de reglas legales hardcodeadas: van a `Setting`, `VacationRule` o a los catálogos.
- Con Cache Components, toda lectura de base o de cookies va dentro de un `<Suspense>`.
- Antes de cerrar una fase: `npm run check` y `npm run build` sin errores.

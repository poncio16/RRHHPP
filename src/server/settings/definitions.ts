import { z } from "@/lib/zod";

/**
 * Parámetros guardados en la tabla `setting`. Cada clave tiene su esquema con
 * valores por defecto: si la fila falta o es inválida se usan los defaults.
 * Se editan desde Configuración → Parámetros con un formulario armado a partir
 * de `fields` (todos los parámetros actuales son números enteros).
 */
/** Tope técnico de un archivo subido (coincide con los límites de `next.config.ts`). */
export const MAX_UPLOAD_MB = 20;

export type SettingFieldMeta = { name: string; label: string; unit: string; hint?: string };

export const SETTING_DEFINITIONS = {
  security: {
    title: "Seguridad",
    description: "Sesiones, bloqueo por intentos fallidos y política de contraseñas.",
    fields: [
      {
        name: "sessionIdleMinutes",
        label: "Cierre de sesión por inactividad",
        unit: "minutos",
        hint: "Entre 5 y 1440.",
      },
      {
        name: "sessionAbsoluteHours",
        label: "Duración máxima de una sesión",
        unit: "horas",
        hint: "Entre 1 y 168. Después hay que volver a ingresar aunque haya actividad.",
      },
      {
        name: "maxFailedLogins",
        label: "Intentos fallidos antes del bloqueo",
        unit: "intentos",
        hint: "Entre 3 y 20.",
      },
      { name: "lockMinutes", label: "Duración del bloqueo", unit: "minutos", hint: "Entre 1 y 1440." },
      {
        name: "passwordMinLength",
        label: "Largo mínimo de contraseña",
        unit: "caracteres",
        hint: "Entre 8 y 64. Se exige en las contraseñas nuevas.",
      },
    ] satisfies SettingFieldMeta[],
    schema: z.object({
      sessionIdleMinutes: z
        .number()
        .int()
        .min(5)
        .max(24 * 60)
        .default(30),
      sessionAbsoluteHours: z
        .number()
        .int()
        .min(1)
        .max(24 * 7)
        .default(10),
      maxFailedLogins: z.number().int().min(3).max(20).default(5),
      lockMinutes: z
        .number()
        .int()
        .min(1)
        .max(24 * 60)
        .default(15),
      passwordMinLength: z.number().int().min(8).max(64).default(10),
    }),
  },
  documents: {
    title: "Documentación",
    description: "Archivos adjuntos y aviso de vencimientos.",
    fields: [
      {
        name: "maxFileSizeMb",
        label: "Tamaño máximo de cada archivo",
        unit: "MB",
        hint: "Entre 1 y 20.",
      },
      {
        name: "alertDaysBefore",
        label: "Anticipación del aviso de vencimiento",
        unit: "días",
        hint: "Entre 1 y 365. Cada tipo de documento puede tener su propia anticipación.",
      },
    ] satisfies SettingFieldMeta[],
    schema: z.object({
      maxFileSizeMb: z.number().int().min(1).max(MAX_UPLOAD_MB).default(10),
      alertDaysBefore: z.number().int().min(1).max(365).default(30),
    }),
  },
  leaves: {
    title: "Licencias y ausencias",
    description: "Conteo de días hábiles de las licencias, ausencias y vacaciones.",
    fields: [
      {
        name: "defaultWorkDays",
        label: "Días hábiles por semana sin horario asignado",
        unit: "días",
        hint: "Entre 1 y 7, contando desde el lunes (5 = lunes a viernes). Si el empleado tiene horario, se usan sus días. Los feriados no se cuentan.",
      },
    ] satisfies SettingFieldMeta[],
    schema: z.object({
      defaultWorkDays: z.number().int().min(1).max(7).default(5),
    }),
  },
  vacations: {
    title: "Vacaciones",
    description:
      "Criterios para calcular los días de cada período anual. Los valores iniciales son los de referencia de la Ley de Contrato de Trabajo: validalos con el asesor laboral o el convenio.",
    fields: [
      {
        name: "cutoffMonth",
        label: "Mes de corte de la antigüedad",
        unit: "mes",
        hint: "1 a 12. La antigüedad de cada período se calcula a esta fecha.",
      },
      {
        name: "cutoffDay",
        label: "Día de corte de la antigüedad",
        unit: "día",
        hint: "1 a 31. Si el mes tiene menos días, se usa el último.",
      },
      {
        name: "proportionalMinPercent",
        label: "Mínimo trabajado para el período completo",
        unit: "% de los días hábiles",
        hint: "Con menos días hábiles trabajados en los doce meses previos al corte, corresponde la proporción de abajo. 0 la desactiva.",
      },
      {
        name: "proportionalWorkedDays",
        label: "Proporción: un día de vacaciones cada",
        unit: "días trabajados",
        hint: "Entre 1 y 365.",
      },
    ] satisfies SettingFieldMeta[],
    schema: z.object({
      cutoffMonth: z.number().int().min(1).max(12).default(12),
      cutoffDay: z.number().int().min(1).max(31).default(31),
      proportionalMinPercent: z.number().int().min(0).max(100).default(50),
      proportionalWorkedDays: z.number().int().min(1).max(365).default(20),
    }),
  },
  attendance: {
    title: "Asistencia",
    description:
      "Criterios para calcular llegadas tarde y horas adicionales a partir del horario asignado. Dependen de la política de la empresa o del convenio.",
    fields: [
      {
        name: "lateToleranceMinutes",
        label: "Tolerancia de llegada tarde",
        unit: "minutos",
        hint: "Entre 0 y 120. Llegar hasta esta cantidad de minutos después del horario no cuenta como tarde; pasado ese margen se cuentan todos los minutos.",
      },
      {
        name: "extraMinimumMinutes",
        label: "Mínimo para contar horas adicionales",
        unit: "minutos",
        hint: "Entre 0 y 240. Lo trabajado por encima del horario cuenta como adicional cuando llega a este mínimo. 0 cuenta cualquier exceso.",
      },
    ] satisfies SettingFieldMeta[],
    schema: z.object({
      lateToleranceMinutes: z.number().int().min(0).max(120).default(0),
      extraMinimumMinutes: z.number().int().min(0).max(240).default(0),
    }),
  },
} as const;

export type SettingKey = keyof typeof SETTING_DEFINITIONS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTING_DEFINITIONS)[K]["schema"]>;

export function defaultSetting<K extends SettingKey>(key: K): SettingValue<K> {
  return SETTING_DEFINITIONS[key].schema.parse({}) as SettingValue<K>;
}

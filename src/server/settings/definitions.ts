import { z } from "@/lib/zod";

/**
 * Parámetros guardados en la tabla `setting`. Cada clave tiene su esquema con
 * valores por defecto: si la fila falta o es inválida se usan los defaults.
 * Se editan desde Configuración → Parámetros con un formulario armado a partir
 * de `fields` (todos los parámetros actuales son números enteros).
 */
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
} as const;

export type SettingKey = keyof typeof SETTING_DEFINITIONS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTING_DEFINITIONS)[K]["schema"]>;

export function defaultSetting<K extends SettingKey>(key: K): SettingValue<K> {
  return SETTING_DEFINITIONS[key].schema.parse({}) as SettingValue<K>;
}

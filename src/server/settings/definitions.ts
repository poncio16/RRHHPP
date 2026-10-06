import { z } from "@/lib/zod";

/**
 * Parámetros guardados en la tabla `setting`. Cada clave tiene su esquema con
 * valores por defecto: si la fila falta o es inválida se usan los defaults.
 * Se editan desde Configuración (Fase 4).
 */
export const SETTING_DEFINITIONS = {
  security: {
    description: "Sesiones, bloqueo por intentos fallidos y política de contraseñas.",
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

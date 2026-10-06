import "server-only";
import { db } from "../db";
import { logger } from "../logger";
import { SETTING_DEFINITIONS, defaultSetting, type SettingKey, type SettingValue } from "./definitions";

export { defaultSetting, SETTING_DEFINITIONS, type SettingKey, type SettingValue } from "./definitions";

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const row = await db.setting.findUnique({ where: { key } });
  if (!row) return defaultSetting(key);
  const parsed = SETTING_DEFINITIONS[key].schema.safeParse(row.value);
  if (!parsed.success) {
    logger.warn({ key, issues: parsed.error.issues }, "Parámetro inválido en la base; se usan los valores por defecto");
    return defaultSetting(key);
  }
  return parsed.data as SettingValue<K>;
}

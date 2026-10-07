import "server-only";
import { auditDiff, recordAudit } from "@/server/audit";
import { assertPermission } from "@/server/authz";
import type { ActorContext } from "@/server/context";
import { db } from "@/server/db";
import { getSetting, SETTING_DEFINITIONS, type SettingKey } from "@/server/settings";

const MODULE = "configuracion";

export const SETTING_KEYS = Object.keys(SETTING_DEFINITIONS) as SettingKey[];

/** Parámetros con su valor vigente (o el valor por defecto si nunca se guardó). */
export async function listSettings(ctx: ActorContext) {
  await assertPermission(ctx, "config:manage", MODULE);
  return Promise.all(
    SETTING_KEYS.map(async (key) => ({
      key,
      title: SETTING_DEFINITIONS[key].title,
      description: SETTING_DEFINITIONS[key].description,
      value: (await getSetting(key)) as Record<string, number>,
    })),
  );
}

export async function saveSetting(ctx: ActorContext, key: SettingKey, input: unknown) {
  await assertPermission(ctx, "config:manage", MODULE);
  const definition = SETTING_DEFINITIONS[key];
  const value = definition.schema.parse(input);

  // Valor vigente (o el de defecto si nunca se guardó), para auditar solo lo que cambia.
  const before = (await getSetting(key)) as Record<string, unknown>;
  await db.$transaction(async (tx) => {
    await tx.setting.upsert({
      where: { key },
      create: { key, value, description: definition.description, updatedById: ctx.userId },
      update: { value, updatedById: ctx.userId },
    });
    const diff = auditDiff(before, value);
    if (!diff) return;
    await recordAudit(
      ctx,
      {
        action: "UPDATE",
        module: MODULE,
        entityType: "Setting",
        entityId: key,
        ...diff,
        message: `Parámetros: ${definition.title}`,
      },
      tx,
    );
  });
}

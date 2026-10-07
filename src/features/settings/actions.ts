"use server";

import { z } from "@/lib/zod";
import { requireActionContext } from "@/server/auth/request";
import { runAction } from "@/server/errors";
import { SETTING_DEFINITIONS, type SettingKey } from "@/server/settings/definitions";
import * as service from "./service";

const settingKey = z.enum(Object.keys(SETTING_DEFINITIONS) as [SettingKey, ...SettingKey[]]);

export async function saveSettingAction(key: string, input: unknown) {
  return runAction(async () =>
    service.saveSetting(await requireActionContext("config:manage", "configuracion"), settingKey.parse(key), input),
  );
}

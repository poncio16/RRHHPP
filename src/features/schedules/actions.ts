"use server";

import { z } from "@/lib/zod";
import { requireActionContext } from "@/server/auth/request";
import { runAction } from "@/server/errors";
import * as service from "./service";

const MODULE = "configuracion";
const id = z.uuid();

export async function createScheduleAction(input: unknown) {
  return runAction(async () => service.createSchedule(await requireActionContext("config:catalogs", MODULE), input));
}

export async function updateScheduleAction(scheduleId: string, input: unknown) {
  return runAction(async () =>
    service.updateSchedule(await requireActionContext("config:catalogs", MODULE), id.parse(scheduleId), input),
  );
}

export async function setScheduleActiveAction(scheduleId: string, isActive: boolean) {
  return runAction(async () =>
    service.setScheduleActive(
      await requireActionContext("config:catalogs", MODULE),
      id.parse(scheduleId),
      z.boolean().parse(isActive),
    ),
  );
}

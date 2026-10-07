"use server";

import { z } from "@/lib/zod";
import { requireActionContext } from "@/server/auth/request";
import { runAction } from "@/server/errors";
import * as service from "./service";

const MODULE = "configuracion";
const id = z.uuid();

export async function createHolidayAction(input: unknown) {
  return runAction(async () => service.createHoliday(await requireActionContext("config:catalogs", MODULE), input));
}

export async function updateHolidayAction(holidayId: string, input: unknown) {
  return runAction(async () =>
    service.updateHoliday(await requireActionContext("config:catalogs", MODULE), id.parse(holidayId), input),
  );
}

export async function deleteHolidayAction(holidayId: string) {
  return runAction(async () =>
    service.deleteHoliday(await requireActionContext("config:catalogs", MODULE), id.parse(holidayId)),
  );
}

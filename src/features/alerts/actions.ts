"use server";

import { requireActionContext } from "@/server/auth/request";
import { runAction } from "@/server/errors";
import * as service from "./service";

/** Posponer, descartar o restaurar; el servicio controla el permiso de cada clase de alerta. */
export async function changeAlertStateAction(input: unknown) {
  return runAction(async () => service.changeAlertState(await requireActionContext("employee:read", "alertas"), input));
}

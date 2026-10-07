"use server";

import { requireActionContext } from "@/server/auth/request";
import { runAction } from "@/server/errors";
import * as service from "./service";

export async function saveCompanyAction(input: unknown) {
  return runAction(async () =>
    service.saveCompany(await requireActionContext("config:manage", "configuracion"), input),
  );
}

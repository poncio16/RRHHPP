"use server";

import { requireActionContext } from "@/server/auth/request";
import { runAction } from "@/server/errors";
import * as service from "./service";

export async function updateRolePermissionsAction(input: unknown) {
  return runAction(async () =>
    service.updateRolePermissions(await requireActionContext("user:manage", "usuarios"), input),
  );
}

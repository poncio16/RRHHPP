"use server";

import { z } from "@/lib/zod";
import { requireActionContext } from "@/server/auth/request";
import { runAction } from "@/server/errors";
import * as service from "./service";

const MODULE = "egresos";
const id = z.uuid();

/** `employeeId` en null: el empleado se elige en el formulario (listado general). */
export async function createExitAction(employeeId: string | null, input: unknown) {
  return runAction(async () =>
    service.createExit(
      await requireActionContext("exit:write", MODULE),
      employeeId === null ? null : id.parse(employeeId),
      input,
    ),
  );
}

export async function updateExitAction(exitId: string, input: unknown) {
  return runAction(async () =>
    service.updateExit(await requireActionContext("exit:write", MODULE), id.parse(exitId), input),
  );
}

export async function confirmExitAction(exitId: string, input: unknown) {
  return runAction(async () =>
    service.confirmExit(await requireActionContext("exit:write", MODULE), id.parse(exitId), input),
  );
}

export async function annulExitAction(exitId: string, input: unknown) {
  return runAction(async () =>
    service.annulExit(await requireActionContext("exit:write", MODULE), id.parse(exitId), input),
  );
}

export async function rehireEmployeeAction(employeeId: string, input: unknown) {
  return runAction(async () =>
    service.rehireEmployee(await requireActionContext("exit:write", MODULE), id.parse(employeeId), input),
  );
}

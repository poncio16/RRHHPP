"use server";

import { z } from "@/lib/zod";
import { requireActionContext } from "@/server/auth/request";
import { runAction } from "@/server/errors";
import * as service from "./service";

const MODULE = "licencias";
const id = z.uuid();

/** `employeeId` en null: el empleado se elige en el formulario (listado general). */
export async function createLeaveAction(employeeId: string | null, input: unknown) {
  return runAction(async () =>
    service.createLeave(
      await requireActionContext("leave:write", MODULE),
      employeeId === null ? null : id.parse(employeeId),
      input,
    ),
  );
}

export async function updateLeaveAction(leaveId: string, input: unknown) {
  return runAction(async () =>
    service.updateLeave(await requireActionContext("leave:write", MODULE), id.parse(leaveId), input),
  );
}

export async function decideLeaveAction(leaveId: string, input: unknown) {
  return runAction(async () =>
    service.decideLeave(await requireActionContext("leave:approve", MODULE), id.parse(leaveId), input),
  );
}

export async function annulLeaveAction(leaveId: string, input: unknown) {
  return runAction(async () =>
    service.annulLeave(await requireActionContext("leave:write", MODULE), id.parse(leaveId), input),
  );
}

export async function previewLeaveAction(input: unknown) {
  return runAction(async () => service.previewLeave(await requireActionContext("leave:write", MODULE), input));
}

/** Períodos de vacaciones del empleado con su saldo, para el formulario. */
export async function balanceOptionsAction(employeeId: string, excludeId: string | null) {
  return runAction(async () =>
    service.getBalanceOptions(
      await requireActionContext("leave:write", MODULE),
      id.parse(employeeId),
      excludeId === null ? null : id.parse(excludeId),
    ),
  );
}

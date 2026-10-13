"use server";

import { z } from "@/lib/zod";
import { requireActionContext } from "@/server/auth/request";
import { runAction } from "@/server/errors";
import * as service from "./service";

const MODULE = "empleados";
const id = z.uuid();

export async function createEmployeeAction(input: unknown) {
  return runAction(async () => service.createEmployee(await requireActionContext("employee:write", MODULE), input));
}

export async function updateEmployeeAction(employeeId: string, input: unknown) {
  return runAction(async () =>
    service.updateEmployee(await requireActionContext("employee:write", MODULE), id.parse(employeeId), input),
  );
}

export async function saveBankAccountAction(employeeId: string, input: unknown) {
  return runAction(async () =>
    service.saveBankAccount(await requireActionContext("employee:write", MODULE), id.parse(employeeId), input),
  );
}

export async function setEmployeePhotoAction(employeeId: string, form: FormData) {
  return runAction(async () => {
    const ctx = await requireActionContext("employee:write", MODULE);
    const file = form.get("file");
    return service.setEmployeePhoto(ctx, id.parse(employeeId), file instanceof File ? file : null);
  });
}

export async function removeEmployeePhotoAction(employeeId: string) {
  return runAction(async () =>
    service.removeEmployeePhoto(await requireActionContext("employee:write", MODULE), id.parse(employeeId)),
  );
}

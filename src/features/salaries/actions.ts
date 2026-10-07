"use server";

import { z } from "@/lib/zod";
import { requireActionContext } from "@/server/auth/request";
import { runAction } from "@/server/errors";
import * as service from "./service";

const MODULE = "remuneraciones";
const id = z.uuid();

export async function createSalaryChangeAction(employeeId: string, input: unknown) {
  return runAction(async () =>
    service.createSalaryChange(await requireActionContext("salary:write", MODULE), id.parse(employeeId), input),
  );
}

export async function updateSalaryChangeAction(salaryId: string, input: unknown) {
  return runAction(async () =>
    service.updateSalaryChange(await requireActionContext("salary:write", MODULE), id.parse(salaryId), input),
  );
}

/** `employeeId` en null: el empleado se elige en el formulario (listado general). */
export async function createPayrollAction(employeeId: string | null, input: unknown) {
  return runAction(async () =>
    service.createPayroll(
      await requireActionContext("salary:write", MODULE),
      employeeId === null ? null : id.parse(employeeId),
      input,
    ),
  );
}

export async function updatePayrollAction(payrollId: string, input: unknown) {
  return runAction(async () =>
    service.updatePayroll(await requireActionContext("salary:write", MODULE), id.parse(payrollId), input),
  );
}

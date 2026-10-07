"use server";

import { z } from "@/lib/zod";
import { requireActionContext } from "@/server/auth/request";
import { runAction } from "@/server/errors";
import * as service from "./service";

const MODULE = "asistencia";
const id = z.uuid();

/** `employeeId` en null: el empleado se elige en el formulario (listado general). */
export async function saveAttendanceDayAction(employeeId: string | null, input: unknown) {
  return runAction(async () =>
    service.saveDay(
      await requireActionContext("attendance:write", MODULE),
      employeeId === null ? null : id.parse(employeeId),
      input,
    ),
  );
}

export async function previewAttendanceDayAction(employeeId: string, input: unknown) {
  return runAction(async () =>
    service.previewDay(await requireActionContext("attendance:write", MODULE), id.parse(employeeId), input),
  );
}

export async function saveAttendanceSheetAction(input: unknown) {
  return runAction(async () => service.saveSheet(await requireActionContext("attendance:write", MODULE), input));
}

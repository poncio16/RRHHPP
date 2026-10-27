"use server";

import { z } from "@/lib/zod";
import { requireActionContext } from "@/server/auth/request";
import { runAction } from "@/server/errors";
import * as service from "./service";

const MODULE = "retiros";
const id = z.uuid();

export async function createEntryAction(input: unknown) {
  return runAction(async () => service.createEntry(await requireActionContext("salary:write", MODULE), input));
}

export async function voidEntryAction(entryId: string, input: unknown) {
  return runAction(async () =>
    service.voidEntry(await requireActionContext("salary:write", MODULE), id.parse(entryId), input),
  );
}

/** Una planilla por llamada: el navegador las sube de a una. */
export async function importSpreadsheetAction(form: FormData) {
  return runAction(async () => {
    const ctx = await requireActionContext("salary:write", MODULE);
    const file = form.get("file");
    return service.importSpreadsheet(ctx, file instanceof File ? file : null);
  });
}

export async function saveSheetAssignmentsAction(input: unknown) {
  return runAction(async () => service.saveSheetAssignments(await requireActionContext("salary:write", MODULE), input));
}

export async function linkAccountEmployeeAction(accountId: string, input: unknown) {
  return runAction(async () =>
    service.linkAccountEmployee(await requireActionContext("salary:write", MODULE), id.parse(accountId), input),
  );
}

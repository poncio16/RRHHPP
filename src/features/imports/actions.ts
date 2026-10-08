"use server";

import { z } from "@/lib/zod";
import { requireActionContext } from "@/server/auth/request";
import { runAction } from "@/server/errors";
import * as service from "./service";

const MODULE = "importacion";
const id = z.uuid();

export async function validateImportAction(form: FormData) {
  return runAction(async () => {
    const ctx = await requireActionContext("import:run", MODULE);
    const file = form.get("file");
    return service.validateImport(ctx, file instanceof File ? file : null);
  });
}

export async function confirmImportAction(jobId: string) {
  return runAction(async () =>
    service.confirmImport(await requireActionContext("import:run", MODULE), id.parse(jobId)),
  );
}

export async function discardImportAction(jobId: string) {
  return runAction(async () =>
    service.discardImport(await requireActionContext("import:run", MODULE), id.parse(jobId)),
  );
}

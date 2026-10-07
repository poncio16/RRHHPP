"use server";

import { z } from "@/lib/zod";
import { requireActionContext } from "@/server/auth/request";
import { runAction } from "@/server/errors";
import * as service from "./service";

const MODULE = "documentacion";
const id = z.uuid();

/** Separa los campos de texto del archivo adjunto (campo `file`). */
function splitForm(form: FormData) {
  const fields: Record<string, string> = {};
  let file: File | null = null;
  for (const [key, value] of form.entries()) {
    if (key === "file") file = value instanceof File && value.size > 0 ? value : null;
    else if (typeof value === "string") fields[key] = value;
  }
  return { fields, file };
}

/** `employeeId` en null: el empleado se elige en el formulario (listado general). */
export async function createDocumentAction(employeeId: string | null, form: FormData) {
  return runAction(async () => {
    const ctx = await requireActionContext("document:write", MODULE);
    const { fields, file } = splitForm(form);
    return service.createDocument(ctx, employeeId === null ? null : id.parse(employeeId), fields, file);
  });
}

export async function updateDocumentAction(documentId: string, form: FormData) {
  return runAction(async () => {
    const ctx = await requireActionContext("document:write", MODULE);
    const { fields, file } = splitForm(form);
    return service.updateDocument(ctx, id.parse(documentId), fields, file);
  });
}

export async function annulDocumentAction(documentId: string, input: unknown) {
  return runAction(async () =>
    service.annulDocument(await requireActionContext("document:write", MODULE), id.parse(documentId), input),
  );
}

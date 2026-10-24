"use server";

import { z } from "@/lib/zod";
import { requireActionContext } from "@/server/auth/request";
import { runAction } from "@/server/errors";
import * as service from "./service";

const MODULE = "documentacion";
const id = z.uuid();

const uploadSchema = z.object({ uploadId: z.uuid(), fileName: z.string().min(1).max(500) });

/**
 * Separa los campos del formulario de la subida del adjunto: el navegador sube
 * el archivo antes (`prepareDocumentUploadAction`) y manda su id y su nombre.
 */
function splitForm(form: FormData) {
  const fields: Record<string, string> = {};
  for (const [key, value] of form.entries()) if (typeof value === "string") fields[key] = value;
  const upload = fields.uploadId ? uploadSchema.parse(fields) : null;
  return { fields, upload };
}

export async function prepareDocumentUploadAction() {
  return runAction(async () => service.prepareDocumentUpload(await requireActionContext("document:write", MODULE)));
}

/** `employeeId` en null: el empleado se elige en el formulario (listado general). */
export async function createDocumentAction(employeeId: string | null, form: FormData) {
  return runAction(async () => {
    const ctx = await requireActionContext("document:write", MODULE);
    const { fields, upload } = splitForm(form);
    return service.createDocument(ctx, employeeId === null ? null : id.parse(employeeId), fields, upload);
  });
}

export async function updateDocumentAction(documentId: string, form: FormData) {
  return runAction(async () => {
    const ctx = await requireActionContext("document:write", MODULE);
    const { fields, upload } = splitForm(form);
    return service.updateDocument(ctx, id.parse(documentId), fields, upload);
  });
}

export async function annulDocumentAction(documentId: string, input: unknown) {
  return runAction(async () =>
    service.annulDocument(await requireActionContext("document:write", MODULE), id.parse(documentId), input),
  );
}

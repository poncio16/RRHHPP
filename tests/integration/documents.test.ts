import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as documents from "@/features/documents/service";
import { receiveUpload } from "@/features/uploads/service";
import { addDays } from "@/features/documents/expiry";
import { toIsoDate, todayInTimeZone } from "@/lib/format";
import type { ActorContext } from "@/server/context";
import { db } from "@/server/db";
import { storage } from "@/server/storage";
import { ConflictError, ForbiddenError, NotFoundError, toAppError, ValidationError } from "@/server/errors";
import { actorFor, createTestUser, lastAudit } from "./helpers";

let rrhh: ActorContext;
let administracion: ActorContext;
let consulta: ActorContext;
const tag = Date.now().toString(36);
const refs = {} as Record<"employee" | "dni" | "expiring" | "sensitive" | "inactive", string>;

const PDF = new TextEncoder().encode("%PDF-1.4\n%prueba\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
/** Lo que hace el navegador: pide la subida, sube el archivo y manda su id con el formulario. */
async function pdf(name = "constancia.pdf", bytes: Uint8Array = PDF, ctx = () => rrhh) {
  const { uploadId } = await documents.prepareDocumentUpload(ctx());
  await receiveUpload(ctx(), uploadId, new Blob([bytes as Uint8Array<ArrayBuffer>]).stream(), bytes.byteLength);
  return { uploadId, fileName: name };
}
const iso = (days: number) => toIsoDate(addDays(todayInTimeZone(), days));

async function appErrorOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return toAppError(error);
  }
  throw new Error("Se esperaba un error");
}

/** Archivos en el disco de prueba. */
async function storedFiles() {
  return (await readdir(process.env.STORAGE_DIR!, { recursive: true, withFileTypes: true })).filter((f) => f.isFile())
    .length;
}

async function version(id: string) {
  return (await db.document.findUniqueOrThrow({ where: { id } })).updatedAt.toISOString();
}

beforeAll(async () => {
  rrhh = await actorFor((await createTestUser("RRHH")).id);
  administracion = await actorFor((await createTestUser("ADMINISTRACION")).id);
  consulta = await actorFor((await createTestUser("CONSULTA")).id);

  const province = await db.province.upsert({
    where: { code: "AR-X" },
    update: {},
    create: { code: "AR-X", name: "Santa Cruz" },
  });
  const employee = await db.employee.create({
    data: {
      fileNumber: 900_000 + Math.floor(Math.random() * 90_000),
      lastName: "Documentos",
      firstName: `Prueba ${tag}`,
      dni: String(10_000_000 + Math.floor(Math.random() * 9_000_000)),
      cuil: `20${Math.floor(Math.random() * 1e9)}`.padEnd(11, "0").slice(0, 11),
      birthDate: new Date("1990-01-01"),
      sex: "F",
      addressLine: "Calle 1",
      city: "Ciudad",
      provinceId: province.id,
      postalCode: "9400",
      hireDate: new Date("2020-01-01"),
      seniorityDate: new Date("2020-01-01"),
      departmentId: (await db.department.create({ data: { name: `Doc sector ${tag}` } })).id,
      positionId: (await db.position.create({ data: { name: `Doc puesto ${tag}` } })).id,
      contractTypeId: (await db.contractType.create({ data: { name: `Doc contrato ${tag}` } })).id,
      workplaceId: (await db.workplace.create({ data: { name: `Doc lugar ${tag}` } })).id,
    },
  });
  refs.employee = employee.id;
  refs.dni = (await db.documentType.create({ data: { name: `DNI ${tag}` } })).id;
  refs.expiring = (
    await db.documentType.create({ data: { name: `Carnet ${tag}`, requiresExpiry: true, alertDaysBefore: 10 } })
  ).id;
  refs.sensitive = (
    await db.documentType.create({ data: { name: `Certificado médico ${tag}`, isSensitive: true } })
  ).id;
  refs.inactive = (await db.documentType.create({ data: { name: `Viejo ${tag}`, isActive: false } })).id;
});

afterAll(async () => {
  await db.$disconnect();
});

const base = (overrides: Record<string, unknown> = {}) => ({
  documentTypeId: refs.dni,
  issueDate: "",
  expiryDate: "",
  status: "PRESENTADO",
  notes: "",
  ...overrides,
});

describe("alta de documentos", () => {
  it("guarda el archivo con nombre interno, hash y auditoría", async () => {
    const { id } = await documents.createDocument(rrhh, refs.employee, base(), await pdf("../../etc/DNI frente.PDF"));
    const doc = await db.document.findUniqueOrThrow({ where: { id }, include: { file: true } });
    expect(doc.file).toMatchObject({
      originalName: "DNI frente.pdf",
      mimeType: "application/pdf",
      sizeBytes: PDF.length,
    });
    expect(doc.file!.storageKey).toMatch(/^\d{4}\/\d{2}\/[0-9a-f-]{36}$/);
    expect(doc.file!.sha256).toHaveLength(64);
    const stored = await readFile(path.join(process.env.STORAGE_DIR!, doc.file!.storageKey));
    expect(stored.equals(Buffer.from(PDF))).toBe(true);
    expect(await lastAudit({ entityId: id })).toMatchObject({ action: "CREATE", entityType: "Document" });
  });

  it("rechaza archivos que no son PDF o imagen aunque tengan la extensión", async () => {
    const fake = await pdf("dni.pdf", new TextEncoder().encode("MZ\x90\x00ejecutable"));
    const before = await storedFiles();
    const error = await appErrorOf(documents.createDocument(rrhh, refs.employee, base(), fake));
    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toMatchObject({ fieldErrors: { file: [expect.stringContaining("no es un PDF")] } });
    // El archivo rechazado se descarta y la subida no se puede volver a usar.
    expect(await storedFiles()).toBe(before - 1);
    expect(await appErrorOf(documents.createDocument(rrhh, refs.employee, base(), fake))).toMatchObject({
      fieldErrors: { file: [expect.stringContaining("venció")] },
    });
  });

  it("respeta el tamaño máximo configurado", async () => {
    await db.setting.upsert({
      where: { key: "documents" },
      update: { value: { maxFileSizeMb: 1, alertDaysBefore: 30 } },
      create: { key: "documents", value: { maxFileSizeMb: 1, alertDaysBefore: 30 } },
    });
    try {
      const big = new Uint8Array(1024 * 1024 + 1);
      big.set(PDF);
      const error = await appErrorOf(pdf("grande.pdf", big));
      expect(error).toMatchObject({ fieldErrors: { file: ["El archivo supera el máximo de 1 MB."] } });
      // También sin el tamaño declarado: se corta al pasarse.
      const { uploadId } = await documents.prepareDocumentUpload(rrhh);
      const stream = new Blob([big as Uint8Array<ArrayBuffer>]).stream();
      expect(await appErrorOf(receiveUpload(rrhh, uploadId, stream, null))).toMatchObject({
        fieldErrors: { file: ["El archivo supera el máximo de 1 MB."] },
      });
    } finally {
      await db.setting.delete({ where: { key: "documents" } });
    }
  });

  it("valida vencimiento obligatorio, fechas coherentes y tipos inactivos", async () => {
    const noExpiry = await appErrorOf(
      documents.createDocument(rrhh, refs.employee, base({ documentTypeId: refs.expiring }), null),
    );
    expect(noExpiry).toMatchObject({
      fieldErrors: { expiryDate: [expect.stringContaining("requiere fecha de vencimiento")] },
    });

    const backwards = await appErrorOf(
      documents.createDocument(rrhh, refs.employee, base({ issueDate: iso(-5), expiryDate: iso(-10) }), null),
    );
    expect(backwards).toMatchObject({
      fieldErrors: { expiryDate: ["El vencimiento no puede ser anterior a la emisión."] },
    });

    const inactive = await appErrorOf(
      documents.createDocument(rrhh, refs.employee, base({ documentTypeId: refs.inactive }), null),
    );
    expect(inactive).toMatchObject({ fieldErrors: { documentTypeId: expect.any(Array) } });
  });

  it("solo quien tiene permiso de escritura puede cargar", async () => {
    expect(await appErrorOf(documents.createDocument(administracion, refs.employee, base(), null))).toBeInstanceOf(
      ForbiddenError,
    );
  });
});

describe("vencimientos y listado", () => {
  it("clasifica vencidos y por vencer con la anticipación del tipo", async () => {
    const expired = await documents.createDocument(
      rrhh,
      refs.employee,
      base({ documentTypeId: refs.expiring, expiryDate: iso(-1) }),
      null,
    );
    const soon = await documents.createDocument(
      rrhh,
      refs.employee,
      base({ documentTypeId: refs.expiring, expiryDate: iso(10) }),
      null,
    );
    const later = await documents.createDocument(
      rrhh,
      refs.employee,
      base({ documentTypeId: refs.expiring, expiryDate: iso(11) }),
      null,
    );

    const all = await documents.listDocuments(rrhh, { documentTypeId: refs.expiring }, refs.employee);
    const state = (id: string) => all.items.find((d) => d.id === id)?.expiry;
    expect(state(expired.id)).toBe("VENCIDO");
    expect(state(soon.id)).toBe("POR_VENCER");
    expect(state(later.id)).toBe("VIGENTE");

    const dueSoon = await documents.listDocuments(rrhh, { expiry: "por-vencer" }, refs.employee);
    expect(dueSoon.items.map((d) => d.id)).toEqual([soon.id]);
    const overdue = await documents.listDocuments(rrhh, { expiry: "vencidos" }, refs.employee);
    expect(overdue.items.map((d) => d.id)).toEqual([expired.id]);
  });

  it("busca por apellido sin acentos desde el listado general", async () => {
    const result = await documents.listDocuments(rrhh, { q: "documentos", status: "todos" });
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.every((d) => d.employee.id === refs.employee)).toBe(true);
  });
});

describe("subidas directas", () => {
  it("solo las usa quien las pidió, una vez y antes de que venzan", async () => {
    const otro = await actorFor((await createTestUser("RRHH")).id);
    const mine = await pdf();
    expect(await appErrorOf(documents.createDocument(otro, refs.employee, base(), mine))).toMatchObject({
      fieldErrors: { file: [expect.stringContaining("venció")] },
    });
    // Tampoco puede subir el archivo a la subida de otro.
    const { uploadId } = await documents.prepareDocumentUpload(rrhh);
    expect(await appErrorOf(receiveUpload(otro, uploadId, new Blob([PDF]).stream(), PDF.length))).toBeInstanceOf(
      NotFoundError,
    );
    // Vencida: más de 30 minutos desde que se pidió.
    const old = await pdf();
    await db.pendingUpload.update({
      where: { id: old.uploadId },
      data: { createdAt: new Date(Date.now() - 31 * 60_000) },
    });
    expect(await appErrorOf(documents.createDocument(rrhh, refs.employee, base(), old))).toMatchObject({
      fieldErrors: { file: [expect.stringContaining("venció")] },
    });
    // La del dueño sigue sirviendo.
    const { id } = await documents.createDocument(rrhh, refs.employee, base(), mine);
    expect(await db.document.findUniqueOrThrow({ where: { id } })).toMatchObject({ fileId: expect.any(String) });
  });

  it("no pisa un archivo que ya llegó ni recibe otro después de usarla", async () => {
    const { uploadId } = await documents.prepareDocumentUpload(rrhh);
    await receiveUpload(rrhh, uploadId, new Blob([PDF]).stream(), PDF.length);
    const other = new TextEncoder().encode("%PDF-1.4\n%otro\n%%EOF\n");
    expect(await appErrorOf(receiveUpload(rrhh, uploadId, new Blob([other]).stream(), other.length))).toBeInstanceOf(
      ConflictError,
    );
    const { id } = await documents.createDocument(rrhh, refs.employee, base(), { uploadId, fileName: "a.pdf" });
    expect(await appErrorOf(receiveUpload(rrhh, uploadId, new Blob([other]).stream(), other.length))).toBeInstanceOf(
      NotFoundError,
    );
    const file = await documents.openDocumentFile(rrhh, id);
    expect(new Uint8Array(await new Response(file.stream).arrayBuffer())).toEqual(PDF);
  });

  it("sin el archivo subido no registra nada", async () => {
    const { uploadId } = await documents.prepareDocumentUpload(rrhh);
    const error = await appErrorOf(
      documents.createDocument(rrhh, refs.employee, base(), { uploadId, fileName: "nada.pdf" }),
    );
    expect(error).toMatchObject({ fieldErrors: { file: [expect.stringContaining("No llegó el archivo")] } });
  });

  it("descarta las subidas viejas y sus archivos, salvo los que quedaron registrados", async () => {
    // Una que nadie usó, una cuyo archivo llegó después de guardar el formulario
    // sin él (como una subida tardía a Vercel Blob) y una que quedó registrada.
    const unused = await pdf();
    const late = await documents.prepareDocumentUpload(rrhh);
    await appErrorOf(
      documents.createDocument(rrhh, refs.employee, base(), { uploadId: late.uploadId, fileName: "b.pdf" }),
    );
    const lateKey = (await db.pendingUpload.findUniqueOrThrow({ where: { id: late.uploadId } })).storageKey;
    await storage().put(lateKey, PDF);
    const used = await pdf();
    const { id } = await documents.createDocument(rrhh, refs.employee, base(), used);
    const ids = [unused.uploadId, late.uploadId, used.uploadId];
    await db.pendingUpload.updateMany({
      where: { id: { in: ids } },
      data: { createdAt: new Date(Date.now() - 61 * 60_000) },
    });
    const before = await storedFiles();
    await documents.prepareDocumentUpload(rrhh);
    expect(await db.pendingUpload.count({ where: { id: { in: ids } } })).toBe(0);
    expect(await storedFiles()).toBe(before - 2);
    const file = await documents.openDocumentFile(rrhh, id);
    expect(new Uint8Array(await new Response(file.stream).arrayBuffer())).toEqual(PDF);
  });

  it("solo con permiso para cargar documentos", async () => {
    expect(await appErrorOf(documents.prepareDocumentUpload(consulta))).toBeInstanceOf(ForbiddenError);
  });
});

describe("documentación sensible", () => {
  it("no aparece ni se descarga sin el permiso, y el intento queda auditado", async () => {
    const { id } = await documents.createDocument(
      rrhh,
      refs.employee,
      base({ documentTypeId: refs.sensitive }),
      await pdf(),
    );

    const forRrhh = await documents.listDocuments(rrhh, { status: "todos" }, refs.employee);
    expect(forRrhh.items.some((d) => d.id === id)).toBe(true);
    const forAdmin = await documents.listDocuments(administracion, { status: "todos" }, refs.employee);
    expect(forAdmin.items.some((d) => d.id === id)).toBe(false);
    expect((await documents.getDocumentTypeOptions(administracion)).some((t) => t.id === refs.sensitive)).toBe(false);

    expect(await appErrorOf(documents.openDocumentFile(administracion, id))).toBeInstanceOf(ForbiddenError);
    expect(await lastAudit({ userId: administracion.userId })).toMatchObject({
      action: "ACCESS_DENIED",
      result: "DENIED",
    });

    expect(await appErrorOf(documents.listDocuments(consulta, {}))).toBeInstanceOf(ForbiddenError);
  });

  it("registra cada descarga", async () => {
    const { id } = await documents.createDocument(rrhh, refs.employee, base(), await pdf());
    const file = await documents.openDocumentFile(administracion, id);
    const body = new Uint8Array(await new Response(file.stream).arrayBuffer());
    expect(body).toEqual(PDF);
    expect(file).toMatchObject({ name: "constancia.pdf", mime: "application/pdf", size: PDF.length });
    expect(await lastAudit({ entityId: id })).toMatchObject({ action: "FILE_DOWNLOAD", userId: administracion.userId });
  });
});

describe("edición y anulación", () => {
  it("reemplaza el archivo conservando el anterior y detecta ediciones simultáneas", async () => {
    const { id } = await documents.createDocument(rrhh, refs.employee, base(), await pdf("v1.pdf"));
    const first = await db.document.findUniqueOrThrow({ where: { id } });
    const stale = first.updatedAt.toISOString();

    await documents.updateDocument(
      rrhh,
      id,
      { ...base({ status: "OBSERVADO", notes: "Ilegible" }), version: stale },
      await pdf("v2.pdf"),
    );
    const updated = await db.document.findUniqueOrThrow({ where: { id }, include: { file: true } });
    expect(updated).toMatchObject({ status: "OBSERVADO", notes: "Ilegible" });
    expect(updated.file!.originalName).toBe("v2.pdf");
    expect(await db.storedFile.findUnique({ where: { id: first.fileId! } })).not.toBeNull();

    const before = await storedFiles();
    const conflict = await appErrorOf(
      documents.updateDocument(rrhh, id, { ...base(), version: stale }, await pdf("v3.pdf")),
    );
    expect(conflict).toBeInstanceOf(ConflictError);
    // El archivo que llegó se descarta: el cambio no se guardó.
    expect(await storedFiles()).toBe(before);
  });

  it("anula con motivo y después no permite editar", async () => {
    const { id } = await documents.createDocument(rrhh, refs.employee, base({ notes: "Original" }), null);
    const noReason = await appErrorOf(documents.annulDocument(rrhh, id, { version: await version(id), reason: "" }));
    expect(noReason).toMatchObject({ fieldErrors: { reason: expect.any(Array) } });

    await documents.annulDocument(rrhh, id, { version: await version(id), reason: "Cargado por error" });
    const doc = await db.document.findUniqueOrThrow({ where: { id } });
    expect(doc.status).toBe("ANULADO");
    expect(doc.notes).toMatch(/^Original\nAnulado el \d{2}\/\d{2}\/\d{4}: Cargado por error$/);
    expect(await lastAudit({ entityId: id })).toMatchObject({ action: "SOFT_DELETE" });

    const edit = await appErrorOf(documents.updateDocument(rrhh, id, { ...base(), version: await version(id) }, null));
    expect(edit).toBeInstanceOf(ConflictError);

    const active = await documents.listDocuments(rrhh, {}, refs.employee);
    expect(active.items.some((d) => d.id === id)).toBe(false);
    const annulled = await documents.listDocuments(rrhh, { status: "anulados" }, refs.employee);
    expect(annulled.items.find((d) => d.id === id)?.expiry).toBeNull();
  });
});

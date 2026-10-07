import "server-only";
import { createHash } from "node:crypto";
import { formatDate, parseIsoDate, todayInTimeZone, toIsoDate } from "@/lib/format";
import { paginate } from "@/lib/list/query";
import { auditDiff, recordAudit } from "@/server/audit";
import { assertPermission, hasPermission } from "@/server/authz";
import type { ActorContext } from "@/server/context";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { logger } from "@/server/logger";
import { getSetting } from "@/server/settings";
import { newStorageKey, storage } from "@/server/storage";
import { expiryState } from "./expiry";
import { detectFileType, FILE_TYPES_LABEL, safeFileName } from "./files";
import * as repo from "./repository";
import {
  annulDocumentSchema,
  documentListQuerySchema,
  documentSchema,
  documentLeaveSchema,
  documentVersionSchema,
  documentWithEmployeeSchema,
  type DocumentData,
} from "./schemas";

const MODULE = "documentacion";

const canSeeSensitive = (ctx: ActorContext) => hasPermission(ctx, "document.sensitive:read");

/* ----------------------------------------------------------------------------
 * Lectura
 * ------------------------------------------------------------------------- */

function toListItem(doc: repo.DocumentRecord, today: Date, defaultAlertDays: number) {
  const alertDays = doc.documentType.alertDaysBefore ?? defaultAlertDays;
  return {
    id: doc.id,
    employee: doc.employee,
    documentType: { id: doc.documentType.id, name: doc.documentType.name, isSensitive: doc.documentType.isSensitive },
    issueDate: doc.issueDate,
    expiryDate: doc.expiryDate,
    // Un documento anulado ya no vence.
    expiry: doc.status === "ANULADO" ? null : expiryState(doc.expiryDate, today, alertDays),
    status: doc.status,
    notes: doc.notes,
    file: doc.file ? { name: doc.file.originalName, sizeBytes: doc.file.sizeBytes } : null,
    version: doc.updatedAt.toISOString(),
    formValues: {
      documentTypeId: doc.documentTypeId,
      issueDate: doc.issueDate ? toIsoDate(doc.issueDate) : "",
      expiryDate: doc.expiryDate ? toIsoDate(doc.expiryDate) : "",
      status: doc.status === "ANULADO" ? "PRESENTADO" : doc.status,
      notes: doc.notes ?? "",
    },
  };
}

export type DocumentListItem = ReturnType<typeof toListItem>;

/**
 * Documentos de un empleado (`employeeId`) o de todos. Sin
 * `document.sensitive:read` los tipos sensibles no llegan desde acá.
 */
export async function listDocuments(ctx: ActorContext, rawQuery: unknown, employeeId?: string) {
  await assertPermission(ctx, "document:read", MODULE);
  const query = documentListQuerySchema.parse(rawQuery);
  const today = todayInTimeZone();
  const { alertDaysBefore } = await getSetting("documents");
  const { items, total } = await repo.listDocuments(query, {
    employeeId,
    includeSensitive: canSeeSensitive(ctx),
    today,
    defaultAlertDays: alertDaysBefore,
  });
  return {
    ...paginate(
      items.map((doc) => toListItem(doc, today, alertDaysBefore)),
      total,
      query.page,
      query.pageSize,
    ),
    query,
  };
}

/** Tipos visibles para el usuario, para filtros y formularios. */
export async function getDocumentTypeOptions(ctx: ActorContext, includeIds: string[] = []) {
  await assertPermission(ctx, "document:read", MODULE);
  return repo.listTypeOptions(canSeeSensitive(ctx), includeIds);
}

export type DocumentTypeOption = Awaited<ReturnType<typeof getDocumentTypeOptions>>[number];

/** Empleados no egresados, para elegir a quién corresponde un documento nuevo. */
export async function getEmployeeOptions(ctx: ActorContext) {
  await assertPermission(ctx, "document:write", MODULE);
  return repo.listEmployeeOptions();
}

/** Límites de subida vigentes, para mostrarlos en el formulario. */
export async function getUploadLimits() {
  const { maxFileSizeMb } = await getSetting("documents");
  return { maxFileSizeMb, typesLabel: FILE_TYPES_LABEL };
}

/* ----------------------------------------------------------------------------
 * Escritura
 * ------------------------------------------------------------------------- */

type PreparedFile = { key: string; bytes: Uint8Array; name: string; mime: string; sha256: string };

/** Valida tamaño y tipo real del archivo. No escribe nada. */
async function prepareFile(file: File | null): Promise<PreparedFile | null> {
  if (!file || file.size === 0) return null;
  const { maxFileSizeMb } = await getSetting("documents");
  if (file.size > maxFileSizeMb * 1024 * 1024) {
    throw new ValidationError(undefined, { file: [`El archivo supera el máximo de ${maxFileSizeMb} MB.`] });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detectFileType(bytes);
  if (!type) {
    throw new ValidationError(undefined, {
      file: [`El archivo no es un ${FILE_TYPES_LABEL} válido (se revisa el contenido, no solo la extensión).`],
    });
  }
  return {
    key: newStorageKey(),
    bytes,
    name: safeFileName(file.name, type),
    mime: type.mime,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

async function validateType(ctx: ActorContext, data: DocumentData, currentTypeId?: string) {
  const type = await repo.findDocumentType(data.documentTypeId);
  if (!type || (!type.isActive && type.id !== currentTypeId)) {
    throw new ValidationError(undefined, { documentTypeId: ["El tipo de documento no existe o está inactivo."] });
  }
  if (type.isSensitive) await assertPermission(ctx, "document.sensitive:read", MODULE);
  if (type.requiresExpiry && !data.expiryDate) {
    throw new ValidationError(undefined, { expiryDate: [`"${type.name}" requiere fecha de vencimiento.`] });
  }
  return type;
}

/**
 * Guarda el archivo y ejecuta `persist`; si la base falla, descarta el archivo
 * recién escrito (nunca quedó asociado a un registro).
 */
async function withStoredFile<T>(file: PreparedFile | null, persist: () => Promise<T>): Promise<T> {
  if (!file) return persist();
  await storage().put(file.key, file.bytes);
  try {
    return await persist();
  } catch (error) {
    await storage()
      .discard(file.key)
      .catch((e: unknown) => logger.error({ err: e, key: file.key }, "No se pudo descartar un archivo huérfano"));
    throw error;
  }
}

function toRecord(data: DocumentData) {
  return {
    documentTypeId: data.documentTypeId,
    issueDate: data.issueDate ? parseIsoDate(data.issueDate) : null,
    expiryDate: data.expiryDate ? parseIsoDate(data.expiryDate) : null,
    status: data.status,
    notes: data.notes,
  };
}

function auditable(doc: {
  documentTypeId: string;
  issueDate: Date | null;
  expiryDate: Date | null;
  status: string;
  notes: string | null;
  fileId: string | null;
}) {
  return {
    documentTypeId: doc.documentTypeId,
    issueDate: doc.issueDate ? toIsoDate(doc.issueDate) : null,
    expiryDate: doc.expiryDate ? toIsoDate(doc.expiryDate) : null,
    status: doc.status,
    notes: doc.notes,
    fileId: doc.fileId,
  };
}

async function storeFileRecord(
  ctx: ActorContext,
  file: PreparedFile | null,
  tx: Parameters<typeof repo.createStoredFile>[1],
) {
  if (!file) return null;
  const stored = await repo.createStoredFile(
    {
      storageKey: file.key,
      originalName: file.name,
      mimeType: file.mime,
      sizeBytes: file.bytes.byteLength,
      sha256: file.sha256,
      uploadedById: ctx.userId,
    },
    tx,
  );
  return stored.id;
}

/** Alta de un documento. `employeeId` viene de la URL o, desde el listado general, del formulario. */
export async function createDocument(ctx: ActorContext, employeeId: string | null, input: unknown, file: File | null) {
  await assertPermission(ctx, "document:write", MODULE);
  const targetId = employeeId ?? documentWithEmployeeSchema.parse(input).employeeId;
  const data = documentSchema.parse(input);
  const employee = await repo.findEmployeeBasic(targetId);
  if (!employee) throw new NotFoundError("El legajo no existe.");
  const type = await validateType(ctx, data);
  const { leaveRecordId } = documentLeaveSchema.parse(input);
  if (leaveRecordId) {
    const leave = await repo.findLeaveForDocument(leaveRecordId);
    if (!leave || leave.employeeId !== targetId || leave.status === "ANULADA" || leave.status === "RECHAZADA") {
      throw new ValidationError("La licencia a la que se quiere vincular el documento no está vigente.");
    }
  }
  const prepared = await prepareFile(file);

  return withStoredFile(prepared, () =>
    repo.transaction(async (tx) => {
      const fileId = await storeFileRecord(ctx, prepared, tx);
      const doc = await repo.createDocument(
        {
          ...toRecord(data),
          employeeId: targetId,
          fileId,
          leaveRecordId,
          createdById: ctx.userId,
          updatedById: ctx.userId,
        },
        tx,
      );
      await recordAudit(
        ctx,
        {
          action: "CREATE",
          module: MODULE,
          entityType: "Document",
          entityId: doc.id,
          after: { employeeId: targetId, ...auditable(doc), leaveRecordId, fileName: prepared?.name ?? null },
          message: `Documento "${type.name}" de ${employee.lastName}, ${employee.firstName} (legajo ${employee.fileNumber})`,
        },
        tx,
      );
      return { id: doc.id };
    }),
  );
}

async function loadEditable(ctx: ActorContext, id: string) {
  const doc = await repo.findDocument(id);
  if (!doc) throw new NotFoundError("El documento no existe.");
  if (doc.documentType.isSensitive) await assertPermission(ctx, "document.sensitive:read", MODULE);
  if (doc.status === "ANULADO") throw new ConflictError("El documento está anulado y no se puede modificar.");
  return doc;
}

const conflict = () =>
  new ConflictError(
    "Otra persona modificó este documento mientras lo editabas. Cerrá el formulario y volvé a abrirlo para ver los cambios.",
  );

/** Edición de datos y, opcionalmente, reemplazo del archivo (el anterior se conserva). */
export async function updateDocument(ctx: ActorContext, id: string, input: unknown, file: File | null) {
  await assertPermission(ctx, "document:write", MODULE);
  const { version } = documentVersionSchema.parse(input);
  const data = documentSchema.parse(input);
  const current = await loadEditable(ctx, id);
  const type = await validateType(ctx, data, current.documentTypeId);
  const prepared = await prepareFile(file);

  await withStoredFile(prepared, () =>
    repo.transaction(async (tx) => {
      const fileId = (await storeFileRecord(ctx, prepared, tx)) ?? current.fileId;
      const next = { ...toRecord(data), fileId };
      const ok = await repo.updateDocumentVersioned(id, new Date(version), { ...next, updatedById: ctx.userId }, tx);
      if (!ok) throw conflict();
      const diff = auditDiff(auditable(current), auditable(next));
      if (diff) {
        await recordAudit(
          ctx,
          {
            action: "UPDATE",
            module: MODULE,
            entityType: "Document",
            entityId: id,
            ...diff,
            message: `Documento "${type.name}" de ${current.employee.lastName}, ${current.employee.firstName}${prepared ? " (archivo reemplazado)" : ""}`,
          },
          tx,
        );
      }
    }),
  );
}

/** Baja lógica: el documento queda anulado, con el motivo en las observaciones. */
export async function annulDocument(ctx: ActorContext, id: string, input: unknown) {
  await assertPermission(ctx, "document:write", MODULE);
  const { version } = documentVersionSchema.parse(input);
  const { reason } = annulDocumentSchema.parse(input);
  const current = await loadEditable(ctx, id);
  const stamp = `Anulado el ${formatDate(todayInTimeZone())}: ${reason}`;
  const notes = current.notes ? `${current.notes}\n${stamp}` : stamp;

  await repo.transaction(async (tx) => {
    const ok = await repo.updateDocumentVersioned(
      id,
      new Date(version),
      { status: "ANULADO", notes, updatedById: ctx.userId },
      tx,
    );
    if (!ok) throw conflict();
    await recordAudit(
      ctx,
      {
        action: "SOFT_DELETE",
        module: MODULE,
        entityType: "Document",
        entityId: id,
        before: { status: current.status },
        after: { status: "ANULADO", reason },
        message: `Documento "${current.documentType.name}" de ${current.employee.lastName}, ${current.employee.firstName} anulado`,
      },
      tx,
    );
  });
}

/* ----------------------------------------------------------------------------
 * Descarga
 * ------------------------------------------------------------------------- */

/**
 * Abre el archivo de un documento verificando permisos. Toda descarga queda
 * en la auditoría; un intento sobre un documento sensible sin permiso también.
 */
export async function openDocumentFile(ctx: ActorContext, id: string) {
  await assertPermission(ctx, "document:read", MODULE);
  const doc = await repo.findDocument(id);
  if (!doc || !doc.file) throw new NotFoundError("El documento no tiene un archivo adjunto.");
  if (doc.documentType.isSensitive) await assertPermission(ctx, "document.sensitive:read", MODULE);
  const opened = await storage().open(doc.file.storageKey);
  await recordAudit(ctx, {
    action: "FILE_DOWNLOAD",
    module: MODULE,
    entityType: "Document",
    entityId: doc.id,
    after: { fileId: doc.file.id, fileName: doc.file.originalName, sensitive: doc.documentType.isSensitive },
    message: `Descarga de "${doc.documentType.name}" de ${doc.employee.lastName}, ${doc.employee.firstName}`,
  });
  return { ...opened, name: doc.file.originalName, mime: doc.file.mimeType };
}

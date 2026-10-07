import "server-only";
import { idsMatchingName } from "@/features/employees/repository";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { addDays } from "./expiry";
import type { DocumentListQuery } from "./schemas";

type Client = Prisma.TransactionClient | typeof db;

export const documentInclude = {
  documentType: { select: { id: true, name: true, isSensitive: true, alertDaysBefore: true, requiresExpiry: true } },
  file: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true, storageKey: true } },
  employee: { select: { id: true, fileNumber: true, lastName: true, firstName: true, status: true } },
} satisfies Prisma.DocumentInclude;

export type DocumentRecord = Prisma.DocumentGetPayload<{ include: typeof documentInclude }>;

const STATUS_WHERE: Record<DocumentListQuery["status"], Prisma.DocumentWhereInput> = {
  vigentes: { status: { not: "ANULADO" } },
  pendientes: { status: "PENDIENTE" },
  observados: { status: "OBSERVADO" },
  anulados: { status: "ANULADO" },
  todos: {},
};

/**
 * Condición "por vencer": vence entre hoy y hoy + anticipación, donde la
 * anticipación es la del tipo o, si no tiene, la general.
 */
async function dueSoonWhere(today: Date, defaultAlertDays: number): Promise<Prisma.DocumentWhereInput> {
  const custom = await db.documentType.findMany({
    where: { alertDaysBefore: { not: null } },
    select: { id: true, alertDaysBefore: true },
  });
  return {
    OR: [
      ...custom.map((t) => ({
        documentTypeId: t.id,
        expiryDate: { gte: today, lte: addDays(today, t.alertDaysBefore!) },
      })),
      {
        documentTypeId: { notIn: custom.map((t) => t.id) },
        expiryDate: { gte: today, lte: addDays(today, defaultAlertDays) },
      },
    ],
  };
}

export async function listDocuments(
  query: DocumentListQuery,
  scope: { employeeId?: string; includeSensitive: boolean; today: Date; defaultAlertDays: number },
) {
  const and: Prisma.DocumentWhereInput[] = [STATUS_WHERE[query.status]];
  if (scope.employeeId) and.push({ employeeId: scope.employeeId });
  if (!scope.includeSensitive) and.push({ documentType: { isSensitive: false } });
  if (query.documentTypeId) and.push({ documentTypeId: query.documentTypeId });
  if (query.q && !scope.employeeId) {
    const q = query.q;
    and.push(
      /^\d{1,9}$/.test(q) ? { employee: { fileNumber: Number(q) } } : { employeeId: { in: await idsMatchingName(q) } },
    );
  }
  if (query.expiry === "vencidos") and.push({ expiryDate: { lt: scope.today } });
  if (query.expiry === "sin-vencimiento") and.push({ expiryDate: null });
  if (query.expiry === "por-vencer") and.push(await dueSoonWhere(scope.today, scope.defaultAlertDays));
  if (query.expiry === "vigentes") {
    and.push({ expiryDate: { gte: scope.today } }, { NOT: await dueSoonWhere(scope.today, scope.defaultAlertDays) });
  }

  const orderBy: Prisma.DocumentOrderByWithRelationInput[] =
    query.sort === "empleado"
      ? [{ employee: { lastName: "asc" } }, { employee: { firstName: "asc" } }, { createdAt: "desc" }]
      : query.sort === "carga"
        ? [{ createdAt: "desc" }]
        : [{ expiryDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }];

  const where = { AND: and };
  const [items, total] = await Promise.all([
    db.document.findMany({
      where,
      include: documentInclude,
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.document.count({ where }),
  ]);
  return { items, total };
}

export async function findDocument(id: string, client: Client = db) {
  return client.document.findUnique({ where: { id }, include: documentInclude });
}

export async function findDocumentType(id: string, client: Client = db) {
  return client.documentType.findUnique({ where: { id } });
}

/** Tipos activos más los ya asignados; sin los sensibles si el usuario no puede verlos. */
export async function listTypeOptions(includeSensitive: boolean, includeIds: string[] = []) {
  return db.documentType.findMany({
    where: {
      OR: [{ isActive: true }, { id: { in: includeIds } }],
      ...(includeSensitive ? {} : { isSensitive: false }),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      isActive: true,
      isSensitive: true,
      requiresExpiry: true,
      defaultValidityDays: true,
    },
  });
}

export async function listEmployeeOptions() {
  const rows = await db.employee.findMany({
    where: { status: { not: "EGRESADO" } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, fileNumber: true, lastName: true, firstName: true },
  });
  return rows.map((e) => ({ id: e.id, label: `${e.lastName}, ${e.firstName} (${e.fileNumber})` }));
}

export async function findEmployeeBasic(id: string, client: Client = db) {
  return client.employee.findUnique({
    where: { id },
    select: { id: true, fileNumber: true, lastName: true, firstName: true },
  });
}

export async function findLeaveForDocument(id: string) {
  return db.leaveRecord.findUnique({ where: { id }, select: { employeeId: true, status: true } });
}

export async function findExitForDocument(id: string) {
  return db.employeeExit.findUnique({ where: { id }, select: { employeeId: true, status: true } });
}

export async function createStoredFile(data: Prisma.StoredFileUncheckedCreateInput, tx: Prisma.TransactionClient) {
  return tx.storedFile.create({ data });
}

export async function createDocument(data: Prisma.DocumentUncheckedCreateInput, tx: Prisma.TransactionClient) {
  return tx.document.create({ data });
}

/** Actualiza solo si nadie lo modificó desde `updatedAt`; devuelve false si hubo otro cambio. */
export async function updateDocumentVersioned(
  id: string,
  updatedAt: Date,
  data: Prisma.DocumentUncheckedUpdateManyInput,
  tx: Prisma.TransactionClient,
) {
  const result = await tx.document.updateMany({ where: { id, updatedAt }, data });
  return result.count === 1;
}

export function transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return db.$transaction(fn);
}

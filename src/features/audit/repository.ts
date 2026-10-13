import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { labelsFor, type RefModel } from "@/features/employees/repository";
import { RESERVED_TYPE_LABEL } from "@/features/leaves/constants";
import { formatDate } from "@/lib/format";
import { db } from "@/server/db";
import { own } from "./constants";

const listSelect = {
  id: true,
  occurredAt: true,
  userId: true,
  userEmail: true,
  action: true,
  module: true,
  entityType: true,
  entityId: true,
  result: true,
  message: true,
  ip: true,
  user: { select: { name: true } },
} satisfies Prisma.AuditLogSelect;

export async function listEntries(where: Prisma.AuditLogWhereInput, skip: number, take: number) {
  const [items, total] = await Promise.all([
    db.auditLog.findMany({ where, select: listSelect, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], skip, take }),
    db.auditLog.count({ where }),
  ]);
  return { items, total };
}

export function findEntry(id: string) {
  return db.auditLog.findUnique({ where: { id }, include: { user: { select: { name: true, email: true } } } });
}

/** Módulos que tienen eventos, para el filtro. */
export async function usedModules(): Promise<string[]> {
  const rows = await db.auditLog.findMany({
    distinct: ["module"],
    select: { module: true },
    orderBy: { module: "asc" },
  });
  return rows.map((r) => r.module);
}

export function userOptions() {
  return db.user.findMany({
    select: { id: true, name: true, email: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });
}

export function findUser(id: string) {
  return db.user.findUnique({ where: { id }, select: { name: true, email: true } });
}

/** Cómo se muestra cada clase de ID que aparece en el antes y el después. */
type AuditRef =
  | RefModel
  | "role"
  | "user"
  | "province"
  | "healthInsurer"
  | "artProvider"
  | "bank"
  | "documentType"
  | "leaveType"
  | "noveltyType"
  | "salaryConceptType"
  | "vacationBalance"
  | "storedFile"
  | "exit"
  | "leaveRecord"
  | "salaryHistory";

/** Campos con IDs que se pueden mostrar por su nombre. */
const REF_FIELDS: Record<string, AuditRef> = {
  departmentId: "department",
  positionId: "position",
  categoryId: "category",
  agreementId: "agreement",
  contractTypeId: "contractType",
  workdayTypeId: "workdayType",
  workScheduleId: "workSchedule",
  workModalityId: "lookup",
  nationalityId: "lookup",
  maritalStatusId: "lookup",
  accountTypeId: "lookup",
  workplaceId: "workplace",
  defaultWorkplaceId: "workplace",
  supervisorId: "employee",
  employeeId: "employee",
  roleId: "role",
  provinceId: "province",
  healthInsurerId: "healthInsurer",
  artProviderId: "artProvider",
  defaultArtProviderId: "artProvider",
  bankId: "bank",
  documentTypeId: "documentType",
  leaveTypeId: "leaveType",
  noveltyTypeId: "noveltyType",
  generatesNoveltyTypeId: "noveltyType",
  conceptTypeId: "salaryConceptType",
  vacationBalanceId: "vacationBalance",
  fileId: "storedFile",
  photoFileId: "storedFile",
  exitId: "exit",
  leaveRecordId: "leaveRecord",
};

/** Filtros de una exportación que llevan IDs (`filtros` es la consulta de la URL). */
const FILTER_REFS: Record<string, AuditRef> = {
  departmentId: "department",
  sector: "department",
  puesto: "position",
  categoria: "category",
  workplaceId: "workplace",
  establecimiento: "workplace",
  tipo: "noveltyType",
  usuario: "user",
};

/** Registro que dio origen a una novedad generada, según su `sourceType`. */
const SOURCE_REFS: Record<string, AuditRef> = { LEAVE: "leaveRecord", SALARY_HISTORY: "salaryHistory" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ref = { model: AuditRef; id: string };

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

/** IDs de un objeto del antes o el después, incluidos los de `lines`, `filtros` y el origen de una novedad. */
function refsOf(value: unknown): Ref[] {
  const record = asRecord(value);
  if (!record) return [];
  const refs: Ref[] = [];
  const add = (model: AuditRef | undefined, id: unknown) => {
    if (model && typeof id === "string" && UUID.test(id)) refs.push({ model, id });
  };
  for (const [field, v] of Object.entries(record)) {
    if (Array.isArray(v)) {
      for (const item of v) for (const [k, id] of Object.entries(asRecord(item) ?? {})) add(own(REF_FIELDS, k), id);
    } else if (field === "filtros") {
      for (const [k, id] of Object.entries(asRecord(v) ?? {})) add(own(FILTER_REFS, k), id);
    } else if (field === "sourceId") {
      add(own(SOURCE_REFS, String(record.sourceType)), v);
    } else {
      add(own(REF_FIELDS, field), v);
    }
  }
  return refs;
}

type Loader = (ids: string[], options: { canSeeHealth: boolean }) => Promise<{ id: string; label: string }[]>;

const byId = (ids: string[]) => ({ id: { in: ids } });
const named = async (rows: Promise<{ id: string; name: string }[]>) =>
  (await rows).map((r) => ({ id: r.id, label: r.name }));
/** Los tipos sensibles (enfermedad, accidente) son datos de salud: mismo criterio que en Licencias. */
const leaveTypeName = (type: { name: string; isSensitive: boolean }, canSeeHealth: boolean) =>
  type.isSensitive && !canSeeHealth ? RESERVED_TYPE_LABEL : type.name;

const LOADERS: Record<Exclude<AuditRef, RefModel>, Loader> = {
  role: (ids) => named(db.role.findMany({ where: byId(ids), select: { id: true, name: true } })),
  user: async (ids) =>
    (await db.user.findMany({ where: byId(ids), select: { id: true, name: true, email: true } })).map((u) => ({
      id: u.id,
      label: `${u.name} (${u.email})`,
    })),
  province: (ids) => named(db.province.findMany({ where: byId(ids), select: { id: true, name: true } })),
  healthInsurer: (ids) => named(db.healthInsurer.findMany({ where: byId(ids), select: { id: true, name: true } })),
  artProvider: (ids) => named(db.artProvider.findMany({ where: byId(ids), select: { id: true, name: true } })),
  bank: async (ids) =>
    (await db.bank.findMany({ where: byId(ids), select: { id: true, name: true, code: true } })).map((b) => ({
      id: b.id,
      label: `${b.name} (${b.code})`,
    })),
  documentType: (ids) => named(db.documentType.findMany({ where: byId(ids), select: { id: true, name: true } })),
  leaveType: async (ids, { canSeeHealth }) =>
    (await db.leaveType.findMany({ where: byId(ids), select: { id: true, name: true, isSensitive: true } })).map(
      (t) => ({ id: t.id, label: leaveTypeName(t, canSeeHealth) }),
    ),
  noveltyType: (ids) => named(db.noveltyType.findMany({ where: byId(ids), select: { id: true, name: true } })),
  salaryConceptType: (ids) =>
    named(db.salaryConceptType.findMany({ where: byId(ids), select: { id: true, name: true } })),
  vacationBalance: async (ids) =>
    (await db.vacationBalance.findMany({ where: byId(ids), select: { id: true, year: true } })).map((b) => ({
      id: b.id,
      label: `Período ${b.year}`,
    })),
  storedFile: async (ids) =>
    (await db.storedFile.findMany({ where: byId(ids), select: { id: true, originalName: true } })).map((f) => ({
      id: f.id,
      label: f.originalName,
    })),
  exit: async (ids) =>
    (
      await db.employeeExit.findMany({
        where: byId(ids),
        select: { id: true, exitDate: true, exitType: { select: { label: true } } },
      })
    ).map((e) => ({ id: e.id, label: `${e.exitType.label} del ${formatDate(e.exitDate)}` })),
  leaveRecord: async (ids, { canSeeHealth }) =>
    (
      await db.leaveRecord.findMany({
        where: byId(ids),
        select: { id: true, startDate: true, endDate: true, leaveType: { select: { name: true, isSensitive: true } } },
      })
    ).map((r) => ({
      id: r.id,
      label: `${leaveTypeName(r.leaveType, canSeeHealth)} del ${formatDate(r.startDate)} al ${formatDate(r.endDate)}`,
    })),
  salaryHistory: async (ids) =>
    (await db.salaryHistory.findMany({ where: byId(ids), select: { id: true, effectiveDate: true } })).map((s) => ({
      id: s.id,
      label: `Básico desde el ${formatDate(s.effectiveDate)}`,
    })),
};

const isRefModel = (model: AuditRef): model is RefModel => !Object.hasOwn(LOADERS, model);

/**
 * Nombres de los catálogos, empleados y registros referidos en el antes y el
 * después de un evento. Sin permiso para ver datos de salud, los tipos de
 * licencia sensibles se muestran reservados.
 */
export async function referenceLabels(values: unknown[], options: { canSeeHealth: boolean }) {
  const refs = values.flatMap(refsOf);
  const labels = new Map<string, string>();
  const common = refs.filter((r): r is { model: RefModel; id: string } => isRefModel(r.model));
  if (common.length > 0) for (const [id, label] of await labelsFor(common, db)) labels.set(id, label);
  const byModel = new Map<Exclude<AuditRef, RefModel>, string[]>();
  for (const { model, id } of refs) {
    if (!isRefModel(model)) byModel.set(model, [...(byModel.get(model) ?? []), id]);
  }
  for (const [model, ids] of byModel) {
    for (const row of await LOADERS[model](ids, options)) labels.set(row.id, row.label);
  }
  return labels;
}

const employeeName = (e: { lastName: string; firstName: string; fileNumber: number }) =>
  `${e.lastName}, ${e.firstName} (legajo ${e.fileNumber})`;

/** Lo que se sabe del registro afectado para nombrarlo y enlazarlo. */
export type EntityContext = { name?: string; employeeId?: string; userId?: string; group?: string; date?: Date };

type ContextLoader = (id: string, options: { canSeeHealth: boolean }) => Promise<EntityContext | null>;

const ownedSelect = {
  employeeId: true,
  employee: { select: { lastName: true, firstName: true, fileNumber: true } },
} as const;
/** Registros de un legajo: se nombran por el empleado y se enlazan a su pestaña. */
const owned =
  (
    find: (where: {
      where: { id: string };
    }) => Promise<{ employeeId: string; employee: Parameters<typeof employeeName>[0] } | null>,
  ): ContextLoader =>
  async (id) => {
    const row = await find({ where: { id } });
    return row ? { employeeId: row.employeeId, name: employeeName(row.employee) } : null;
  };
const nameOnly = { select: { name: true } } as const;

const CONTEXT_LOADERS: Record<string, ContextLoader> = {
  Employee: async (id) => {
    const e = await db.employee.findUnique({ where: { id }, select: ownedSelect.employee.select });
    return e ? { employeeId: id, name: employeeName(e) } : null;
  },
  User: async (id) => {
    const u = await db.user.findUnique({ where: { id }, select: { name: true, email: true } });
    return u ? { userId: id, name: `${u.name} (${u.email})` } : null;
  },
  Session: async (id) => {
    const s = await db.session.findUnique({
      where: { id },
      select: { user: { select: { id: true, name: true, email: true } } },
    });
    return s ? { userId: s.user.id, name: `${s.user.name} (${s.user.email})` } : null;
  },
  Role: (id) => db.role.findUnique({ where: { id }, ...nameOnly }),
  Company: async (id) => {
    const company = await db.company.findUnique({ where: { id }, select: { legalName: true } });
    return company ? { name: company.legalName } : null;
  },
  ImportJob: async (id) => {
    const job = await db.importJob.findUnique({ where: { id }, select: { fileName: true } });
    return job ? { name: job.fileName } : null;
  },
  WorkSchedule: (id) => db.workSchedule.findUnique({ where: { id }, ...nameOnly }),
  Holiday: async (id) => {
    const h = await db.holiday.findUnique({ where: { id }, select: { name: true, date: true } });
    return h ? { name: `${h.name} (${formatDate(h.date)})`, date: h.date } : null;
  },
  Department: (id) => db.department.findUnique({ where: { id }, ...nameOnly }),
  Position: (id) => db.position.findUnique({ where: { id }, ...nameOnly }),
  Workplace: (id) => db.workplace.findUnique({ where: { id }, ...nameOnly }),
  CollectiveAgreement: (id) => db.collectiveAgreement.findUnique({ where: { id }, ...nameOnly }),
  Category: (id) => db.category.findUnique({ where: { id }, ...nameOnly }),
  ContractType: (id) => db.contractType.findUnique({ where: { id }, ...nameOnly }),
  WorkdayType: (id) => db.workdayType.findUnique({ where: { id }, ...nameOnly }),
  HealthInsurer: (id) => db.healthInsurer.findUnique({ where: { id }, ...nameOnly }),
  ArtProvider: (id) => db.artProvider.findUnique({ where: { id }, ...nameOnly }),
  Bank: (id) => db.bank.findUnique({ where: { id }, ...nameOnly }),
  DocumentType: (id) => db.documentType.findUnique({ where: { id }, ...nameOnly }),
  // Un tipo del catálogo no es un dato de salud de nadie: se nombra como en Configuración.
  LeaveType: (id) => db.leaveType.findUnique({ where: { id }, ...nameOnly }),
  NoveltyType: (id) => db.noveltyType.findUnique({ where: { id }, ...nameOnly }),
  SalaryConceptType: (id) => db.salaryConceptType.findUnique({ where: { id }, ...nameOnly }),
  LookupValue: async (id) => {
    const v = await db.lookupValue.findUnique({ where: { id }, select: { label: true, group: true } });
    return v ? { name: v.label, group: v.group } : null;
  },
  LeaveRecord: owned((q) => db.leaveRecord.findUnique({ ...q, select: ownedSelect })),
  VacationBalance: owned((q) => db.vacationBalance.findUnique({ ...q, select: ownedSelect })),
  AttendanceDay: async (id) => {
    const day = await db.attendanceDay.findUnique({ where: { id }, select: { ...ownedSelect, date: true } });
    return day ? { employeeId: day.employeeId, name: employeeName(day.employee), date: day.date } : null;
  },
  Document: owned((q) => db.document.findUnique({ ...q, select: ownedSelect })),
  EmployeeExit: owned((q) => db.employeeExit.findUnique({ ...q, select: ownedSelect })),
  EmployeeBankAccount: owned((q) => db.employeeBankAccount.findUnique({ ...q, select: ownedSelect })),
  Novelty: owned((q) => db.novelty.findUnique({ ...q, select: ownedSelect })),
  SalaryHistory: owned((q) => db.salaryHistory.findUnique({ ...q, select: ownedSelect })),
  PayrollRecord: owned((q) => db.payrollRecord.findUnique({ ...q, select: ownedSelect })),
};

/** Nombres de los tipos de licencia sensibles (datos de salud). */
export async function sensitiveLeaveTypeNames() {
  return (await db.leaveType.findMany({ where: { isSensitive: true }, select: { name: true } })).map((t) => t.name);
}

/** De estas licencias, las que son de un tipo sensible. */
export async function sensitiveLeaveRecordIds(ids: string[]) {
  const rows = await db.leaveRecord.findMany({
    where: { id: { in: ids.filter((id) => UUID.test(id)) }, leaveType: { isSensitive: true } },
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
}

/**
 * Nombre del registro afectado y, si pertenece a un legajo, el empleado.
 * Null si el tipo no se busca en la base o el registro ya no existe.
 */
export async function findEntityContext(entityType: string, id: string, options: { canSeeHealth: boolean }) {
  const load = Object.hasOwn(CONTEXT_LOADERS, entityType) ? CONTEXT_LOADERS[entityType] : undefined;
  return load && UUID.test(id) ? load(id, options) : null;
}

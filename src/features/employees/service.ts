import "server-only";
import { randomUUID } from "node:crypto";
import * as catalogs from "@/features/catalogs/repository";
import type { Prisma } from "@/generated/prisma/client";
import { formatDate, parseIsoDate, todayInTimeZone, toIsoDate } from "@/lib/format";
import { paginate } from "@/lib/list/query";
import { maskCbu } from "@/lib/validators";
import { auditDiff, recordAudit, sanitizeForAudit } from "@/server/audit";
import { assertPermission, hasPermission } from "@/server/authz";
import type { ActorContext } from "@/server/context";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { HISTORIC_FIELD_NAMES, HISTORIC_FIELDS, STATUS_LABELS, type HistoricField } from "./constants";
import * as repo from "./repository";
import { EXPORT_MAX_ROWS, type Column, type ReportResult } from "@/features/reports/table";
import { buildTimeline, TIMELINE_KIND_FILTER } from "./timeline";
import {
  bankAccountSchema,
  changeMetaSchema,
  employeeListQuerySchema,
  employeeSchema,
  timelineQuerySchema,
  type EmployeeData,
} from "./schemas";

const MODULE = "empleados";

/* ----------------------------------------------------------------------------
 * Lectura
 * ------------------------------------------------------------------------- */

export async function listEmployees(ctx: ActorContext, rawQuery: unknown) {
  await assertPermission(ctx, "employee:read", MODULE);
  const query = employeeListQuerySchema.parse(rawQuery);
  const canSeePersonal = hasPermission(ctx, "employee.personal:read");
  const { items, total } = await repo.listEmployees(query, canSeePersonal, todayInTimeZone());
  return {
    ...paginate(
      items.map(({ leaveRecords, ...e }) => ({
        ...e,
        dni: canSeePersonal ? e.dni : null,
        suspendedUntil: e.status === "ACTIVO" ? (leaveRecords[0]?.endDate ?? null) : null,
      })),
      total,
      query.page,
      query.pageSize,
    ),
    query,
  };
}

/**
 * Listado de empleados para exportar, con los filtros de la pantalla. DNI y
 * CUIL salen solo con permiso de datos personales.
 */
export async function exportEmployeeList(ctx: ActorContext, rawQuery: unknown): Promise<ReportResult> {
  await assertPermission(ctx, "employee:read", MODULE);
  const query = employeeListQuerySchema.parse(rawQuery);
  const canSeePersonal = hasPermission(ctx, "employee.personal:read");
  const today = todayInTimeZone();
  const rows = await repo.listEmployeesForExport(query, canSeePersonal, today, EXPORT_MAX_ROWS);
  const columns: Column[] = [
    { key: "legajo", label: "Legajo", type: "int" },
    { key: "apellido", label: "Apellido" },
    { key: "nombre", label: "Nombre" },
    ...(canSeePersonal
      ? [
          { key: "dni", label: "DNI" },
          { key: "cuil", label: "CUIL" },
        ]
      : []),
    { key: "estado", label: "Estado" },
    { key: "sector", label: "Sector" },
    { key: "puesto", label: "Puesto" },
    { key: "categoria", label: "Categoría" },
    { key: "establecimiento", label: "Establecimiento" },
    { key: "contratacion", label: "Contratación" },
    { key: "ingreso", label: "Ingreso", type: "date" },
    { key: "egreso", label: "Egreso", type: "date" },
  ];
  const statusLabel = { activos: "Activos", suspendidos: "Suspendidos hoy", egresados: "Egresados", todos: "Todos" };
  return {
    title: "Empleados",
    filters: [
      `Estado: ${statusLabel[query.status]}`,
      ...(query.q ? [`Búsqueda: ${query.q}`] : []),
      ...(rows.length === EXPORT_MAX_ROWS ? [`Se exportaron las primeras ${EXPORT_MAX_ROWS} filas.`] : []),
    ],
    tables: [
      {
        id: "empleados",
        title: "Empleados",
        columns,
        rows: rows.map((e) => ({
          legajo: e.fileNumber,
          apellido: e.lastName,
          nombre: e.firstName,
          ...(canSeePersonal ? { dni: e.dni, cuil: e.cuil } : {}),
          estado: e.leaveRecords.length > 0 ? "Suspendido" : STATUS_LABELS[e.status],
          sector: e.department.name,
          puesto: e.position.name,
          categoria: e.category?.name ?? null,
          establecimiento: e.workplace.name,
          contratacion: e.contractType.name,
          ingreso: e.hireDate,
          egreso: e.exitDate,
        })),
        empty: "No hay empleados con estos filtros.",
      },
    ],
  };
}

/** Opciones de los filtros del listado. */
export async function getEmployeeListFilters(ctx: ActorContext) {
  await assertPermission(ctx, "employee:read", MODULE);
  const [departments, workplaces] = await Promise.all([
    catalogs.listOptions("sectores"),
    catalogs.listOptions("establecimientos"),
  ]);
  return { departments, workplaces };
}

/**
 * Legajo con el alcance de campos del usuario: sin `employee.personal:read`
 * los datos personales y de contacto llegan en null desde acá, no solo
 * ocultos en la pantalla.
 */
export async function getEmployee(ctx: ActorContext, id: string) {
  await assertPermission(ctx, "employee:read", MODULE);
  const employee = await repo.findEmployee(id);
  if (!employee) throw new NotFoundError("El legajo no existe.");
  const canSeePersonal = hasPermission(ctx, "employee.personal:read");
  return {
    id: employee.id,
    fileNumber: employee.fileNumber,
    lastName: employee.lastName,
    firstName: employee.firstName,
    status: employee.status,
    version: employee.version,
    labor: {
      hireDate: employee.hireDate,
      seniorityDate: employee.seniorityDate,
      contractEndDate: employee.contractEndDate,
      exitDate: employee.exitDate,
      department: employee.department,
      position: employee.position,
      category: employee.category,
      agreement: employee.agreement,
      contractType: employee.contractType,
      workdayType: employee.workdayType,
      workSchedule: employee.workSchedule,
      workModality: employee.workModality,
      workplace: employee.workplace,
      supervisor: employee.supervisor,
      healthInsurer: employee.healthInsurer,
      artProvider: employee.artProvider,
    },
    personal: canSeePersonal
      ? {
          dni: employee.dni,
          cuil: employee.cuil,
          birthDate: employee.birthDate,
          sex: employee.sex,
          nationality: employee.nationality,
          maritalStatus: employee.maritalStatus,
          addressLine: employee.addressLine,
          city: employee.city,
          province: employee.province,
          postalCode: employee.postalCode,
          phone: employee.phone,
          email: employee.email,
          emergencyContactName: employee.emergencyContactName,
          emergencyContactPhone: employee.emergencyContactPhone,
        }
      : null,
    formValues: canSeePersonal ? toFormValues(employee) : null,
  };
}

export type EmployeeView = Awaited<ReturnType<typeof getEmployee>>;

/** Valores del legajo para el formulario de edición (todo como texto). */
function toFormValues(e: repo.EmployeeDetailRecord) {
  const d = (date: Date | null) => (date ? toIsoDate(date) : "");
  return {
    fileNumber: String(e.fileNumber),
    lastName: e.lastName,
    firstName: e.firstName,
    dni: e.dni,
    cuil: e.cuil,
    birthDate: d(e.birthDate),
    sex: e.sex,
    nationalityId: e.nationalityId ?? "",
    maritalStatusId: e.maritalStatusId ?? "",
    addressLine: e.addressLine,
    city: e.city,
    provinceId: e.provinceId,
    postalCode: e.postalCode,
    phone: e.phone ?? "",
    email: e.email ?? "",
    emergencyContactName: e.emergencyContactName ?? "",
    emergencyContactPhone: e.emergencyContactPhone ?? "",
    hireDate: d(e.hireDate),
    seniorityDate: d(e.seniorityDate),
    contractEndDate: d(e.contractEndDate),
    departmentId: e.departmentId,
    positionId: e.positionId,
    categoryId: e.categoryId ?? "",
    agreementId: e.agreementId ?? "",
    contractTypeId: e.contractTypeId,
    workdayTypeId: e.workdayTypeId ?? "",
    workScheduleId: e.workScheduleId ?? "",
    workModalityId: e.workModalityId ?? "",
    workplaceId: e.workplaceId,
    supervisorId: e.supervisorId ?? "",
    healthInsurerId: e.healthInsurerId ?? "",
    artProviderId: e.artProviderId ?? "",
  };
}

export type EmployeeFormValues = Omit<ReturnType<typeof toFormValues>, "sex"> & { sex: string };

/** Opciones de los selectores del formulario (activas más las ya asignadas). */
export async function getEmployeeFormOptions(ctx: ActorContext, assignedIds: string[] = []) {
  await assertPermission(ctx, "employee:write", MODULE);
  const ids = assignedIds.filter(Boolean);
  const [
    provinces,
    nationalities,
    maritalStatuses,
    departments,
    positions,
    categories,
    agreements,
    contractTypes,
    workdayTypes,
    workSchedules,
    workModalities,
    workplaces,
    healthInsurers,
    artProviders,
    supervisors,
    meta,
  ] = await Promise.all([
    catalogs.listProvinceOptions(),
    catalogs.listOptions("nacionalidades", ids),
    catalogs.listOptions("estado-civil", ids),
    catalogs.listOptions("sectores", ids),
    catalogs.listOptions("puestos", ids),
    catalogs.listOptions("categorias", ids),
    catalogs.listOptions("convenios", ids),
    catalogs.listOptions("tipos-contrato", ids),
    catalogs.listOptions("jornadas", ids),
    repo.scheduleOptions(ids),
    catalogs.listOptions("modalidades", ids),
    catalogs.listOptions("establecimientos", ids),
    catalogs.listOptions("obras-sociales", ids),
    catalogs.listOptions("art", ids),
    repo.listSupervisorOptions(ids),
    repo.formMetadata(),
  ]);
  return {
    provinces,
    nationalities,
    maritalStatuses,
    departments,
    positions,
    categories,
    agreements,
    contractTypes,
    workdayTypes,
    workSchedules,
    workModalities,
    workplaces,
    healthInsurers,
    artProviders,
    supervisors,
    ...meta,
  };
}

export type EmployeeFormOptions = Awaited<ReturnType<typeof getEmployeeFormOptions>>;

export async function getBankAccount(ctx: ActorContext, employeeId: string) {
  await assertPermission(ctx, "employee.bank:read", MODULE);
  return repo.findBankAccount(employeeId);
}

/** Opciones del diálogo de cuenta sueldo. */
export async function getBankFormOptions(ctx: ActorContext, accountTypeId?: string) {
  await assertPermission(ctx, "employee:write", MODULE);
  await assertPermission(ctx, "employee.bank:read", MODULE);
  const [accountTypes, banks] = await Promise.all([
    catalogs.listOptions("tipos-cuenta", accountTypeId ? [accountTypeId] : []),
    repo.listActiveBanks(),
  ]);
  return { accountTypes, banks };
}

export async function getHistory(ctx: ActorContext, employeeId: string) {
  await assertPermission(ctx, "employee:read", MODULE);
  const rows = await repo.listHistory(employeeId);
  // Los cambios bancarios solo se muestran a quien puede ver datos bancarios.
  return hasPermission(ctx, "employee.bank:read") ? rows : rows.filter((r) => r.changeType !== "DATOS_BANCARIOS");
}

/**
 * Línea de tiempo del legajo. Cada fuente se incluye solo si la persona
 * tiene el permiso de ese módulo (básicos, licencias, egresos).
 */
export async function getTimeline(ctx: ActorContext, employeeId: string, rawQuery: unknown) {
  await assertPermission(ctx, "employee:read", MODULE);
  const { tipo } = timelineQuerySchema.parse(rawQuery);
  const employee = await repo.findEmployee(employeeId);
  if (!employee) throw new NotFoundError("El legajo no existe.");
  const can = {
    salary: hasPermission(ctx, "salary:read"),
    leaves: hasPermission(ctx, "leave:read"),
    exits: hasPermission(ctx, "exit:read"),
  };
  const [history, salaries, leaves, exits] = await Promise.all([
    getHistory(ctx, employeeId),
    can.salary ? repo.timelineSalaries(employeeId) : null,
    can.leaves ? repo.timelineLeaves(employeeId) : null,
    can.exits ? repo.timelineExits(employeeId) : null,
  ]);
  const events = buildTimeline({
    hireDate: employee.hireDate,
    history,
    salaries,
    leaves,
    exits,
    canSeeHealth: hasPermission(ctx, "document.sensitive:read"),
  });
  const kinds = TIMELINE_KIND_FILTER[tipo];
  return {
    tipo,
    sources: can,
    events: kinds ? events.filter((e) => kinds.includes(e.kind)) : events,
  };
}

/* ----------------------------------------------------------------------------
 * Escritura
 * ------------------------------------------------------------------------- */

async function assertCanWrite(ctx: ActorContext) {
  await assertPermission(ctx, "employee:write", MODULE);
  // El formulario incluye datos personales: editar exige poder verlos.
  await assertPermission(ctx, "employee.personal:read", MODULE);
}

/** Convierte la salida del esquema a datos de Prisma (fechas de calendario). */
function toRecord(data: EmployeeData) {
  const date = (v: string) => parseIsoDate(v)!;
  const { fileNumber: _fileNumber, ...rest } = data;
  void _fileNumber;
  return {
    ...rest,
    birthDate: date(data.birthDate),
    hireDate: date(data.hireDate),
    seniorityDate: date(data.seniorityDate ?? data.hireDate),
    contractEndDate: data.contractEndDate ? date(data.contractEndDate) : null,
  };
}

type EmployeeRecord = ReturnType<typeof toRecord>;

/** Campos del legajo que se guardan en la auditoría. */
function auditable(e: Partial<Record<string, unknown>>) {
  const { createdAt, updatedAt, createdById, updatedById, version, ...rest } = e;
  void [createdAt, updatedAt, createdById, updatedById, version];
  return Object.fromEntries(
    Object.entries(rest).filter(([, v]) => typeof v !== "object" || v === null || v instanceof Date),
  );
}

const ACTIVE_CHECKS: {
  field: keyof EmployeeRecord;
  label: string;
  check: (tx: Prisma.TransactionClient, id: string) => Promise<unknown>;
}[] = [
  {
    field: "departmentId",
    label: "El sector",
    check: (tx, id) => tx.department.findFirst({ where: { id, isActive: true } }),
  },
  {
    field: "positionId",
    label: "El puesto",
    check: (tx, id) => tx.position.findFirst({ where: { id, isActive: true } }),
  },
  {
    field: "categoryId",
    label: "La categoría",
    check: (tx, id) => tx.category.findFirst({ where: { id, isActive: true } }),
  },
  {
    field: "agreementId",
    label: "El convenio",
    check: (tx, id) => tx.collectiveAgreement.findFirst({ where: { id, isActive: true } }),
  },
  {
    field: "contractTypeId",
    label: "El tipo de contrato",
    check: (tx, id) => tx.contractType.findFirst({ where: { id, isActive: true } }),
  },
  {
    field: "workdayTypeId",
    label: "La jornada",
    check: (tx, id) => tx.workdayType.findFirst({ where: { id, isActive: true } }),
  },
  {
    field: "workScheduleId",
    label: "El horario",
    check: (tx, id) => tx.workSchedule.findFirst({ where: { id, isActive: true } }),
  },
  {
    field: "workModalityId",
    label: "La modalidad",
    check: (tx, id) => tx.lookupValue.findFirst({ where: { id, isActive: true, group: "MODALIDAD_TRABAJO" } }),
  },
  {
    field: "workplaceId",
    label: "El establecimiento",
    check: (tx, id) => tx.workplace.findFirst({ where: { id, isActive: true } }),
  },
  {
    field: "healthInsurerId",
    label: "La obra social",
    check: (tx, id) => tx.healthInsurer.findFirst({ where: { id, isActive: true } }),
  },
  {
    field: "artProviderId",
    label: "La ART",
    check: (tx, id) => tx.artProvider.findFirst({ where: { id, isActive: true } }),
  },
  {
    field: "nationalityId",
    label: "La nacionalidad",
    check: (tx, id) => tx.lookupValue.findFirst({ where: { id, isActive: true, group: "NACIONALIDAD" } }),
  },
  {
    field: "maritalStatusId",
    label: "El estado civil",
    check: (tx, id) => tx.lookupValue.findFirst({ where: { id, isActive: true, group: "ESTADO_CIVIL" } }),
  },
  { field: "provinceId", label: "La provincia", check: (tx, id) => tx.province.findUnique({ where: { id } }) },
];

/**
 * Reglas que necesitan la base: catálogos activos (salvo que ya estuvieran
 * asignados), coherencia categoría–convenio, fin de contrato cuando el tipo
 * lo exige y superior directo sin ciclos.
 */
async function validateAgainstDatabase(
  tx: Prisma.TransactionClient,
  record: EmployeeRecord,
  current?: repo.EmployeeDetailRecord,
) {
  const errors: Record<string, string[]> = {};
  for (const { field, label, check } of ACTIVE_CHECKS) {
    const value = record[field] as string | null;
    if (!value || (current && current[field as keyof typeof current] === value)) continue;
    if (!(await check(tx, value))) errors[field] = [`${label} elegido no existe o está desactivado.`];
  }

  const contractType = await tx.contractType.findUnique({ where: { id: record.contractTypeId } });
  if (contractType?.hasEndDate && !record.contractEndDate) {
    errors.contractEndDate = [`El tipo de contrato "${contractType.name}" exige fecha de finalización.`];
  }

  if (record.categoryId) {
    const category = await tx.category.findUnique({ where: { id: record.categoryId } });
    if (category?.agreementId && category.agreementId !== record.agreementId) {
      errors.categoryId = ["La categoría no corresponde al convenio elegido."];
    }
  }

  if (record.supervisorId) {
    if (current && record.supervisorId === current.id) {
      errors.supervisorId = ["Un empleado no puede ser su propio superior."];
    } else if (current && (await repo.supervisorChain(record.supervisorId, tx)).includes(current.id)) {
      errors.supervisorId = ["Ese empleado depende (directa o indirectamente) de este legajo."];
    }
  }

  if (Object.keys(errors).length > 0) throw new ValidationError(undefined, errors);
}

const REF_MODELS: Record<HistoricField, repo.RefModel | "date"> = {
  departmentId: "department",
  positionId: "position",
  categoryId: "category",
  agreementId: "agreement",
  contractTypeId: "contractType",
  contractEndDate: "date",
  workdayTypeId: "workdayType",
  workScheduleId: "workSchedule",
  workModalityId: "lookup",
  workplaceId: "workplace",
  supervisorId: "employee",
};

/** Filas de historial para los campos con historial que cambiaron. */
async function historyRows(
  tx: Prisma.TransactionClient,
  before: Record<HistoricField, unknown>,
  after: Record<HistoricField, unknown>,
  meta: { employeeId: string; effectiveDate: Date; notes: string | null; actorId: string },
) {
  const changed = HISTORIC_FIELD_NAMES.filter((f) => !sameValue(before[f], after[f]));
  const refIds = changed.flatMap((f) => {
    const model = REF_MODELS[f];
    if (model === "date") return [];
    return [before[f], after[f]].filter((v): v is string => typeof v === "string").map((id) => ({ model, id }));
  });
  const labels = await repo.labelsFor(refIds, tx);
  const changeSetId = randomUUID();
  return changed.map((field) => {
    const model = REF_MODELS[field];
    const text = (v: unknown) =>
      v === null || v === undefined
        ? null
        : model === "date"
          ? formatDate(v as Date)
          : (labels.get(v as string) ?? null);
    const ref = (v: unknown) => (model === "date" || typeof v !== "string" ? null : v);
    return {
      employeeId: meta.employeeId,
      changeSetId,
      changeType: HISTORIC_FIELDS[field].type,
      field,
      oldValue: text(before[field]),
      newValue: text(after[field]),
      oldRefId: ref(before[field]),
      newRefId: ref(after[field]),
      effectiveDate: meta.effectiveDate,
      notes: meta.notes,
      createdById: meta.actorId,
    } satisfies Prisma.EmployeeChangeHistoryCreateManyInput;
  });
}

function sameValue(a: unknown, b: unknown) {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return (a ?? null) === (b ?? null);
}

export async function createEmployee(ctx: ActorContext, input: unknown) {
  await assertCanWrite(ctx);
  const data = employeeSchema.parse(input);
  const record = toRecord(data);

  return repo.transaction(async (tx) => {
    await validateAgainstDatabase(tx, record);
    const fileNumber = data.fileNumber ?? (await repo.nextFileNumber(tx));
    const created = await repo.createEmployee(
      { ...record, fileNumber, status: "ACTIVO", createdById: ctx.userId, updatedById: ctx.userId },
      tx,
    );
    await recordAudit(
      ctx,
      {
        action: "CREATE",
        module: MODULE,
        entityType: "Employee",
        entityId: created.id,
        after: sanitizeForAudit(auditable(created)),
        message: `Alta de legajo ${created.fileNumber}: ${created.lastName}, ${created.firstName}`,
      },
      tx,
    );
    return { id: created.id, fileNumber: created.fileNumber };
  });
}

export async function updateEmployee(ctx: ActorContext, id: string, input: unknown) {
  await assertCanWrite(ctx);
  const data = employeeSchema.parse(input);
  const meta = changeMetaSchema.parse(input);
  const record = toRecord(data);

  await repo.transaction(async (tx) => {
    const current = await repo.findEmployee(id, tx);
    if (!current) throw new NotFoundError("El legajo no existe.");
    if (current.version !== meta.version) throw staleError();
    await validateAgainstDatabase(tx, record, current);
    if (current.exitDate && record.hireDate > current.exitDate) {
      throw new ValidationError(undefined, {
        hireDate: [`No puede ser posterior al egreso (${formatDate(current.exitDate)}).`],
      });
    }

    const historyChanged = HISTORIC_FIELD_NAMES.some((f) => !sameValue(current[f], record[f]));
    let effectiveDate: Date | null = null;
    if (historyChanged) {
      effectiveDate = meta.effectiveDate ? parseIsoDate(meta.effectiveDate) : null;
      if (!effectiveDate) {
        throw new ValidationError(undefined, {
          effectiveDate: ["Indicá desde cuándo rige el cambio de puesto, sector u otros datos laborales."],
        });
      }
      if (effectiveDate > todayInTimeZone()) {
        throw new ValidationError(undefined, {
          effectiveDate: ["La fecha efectiva no puede ser futura: los cambios programados no están disponibles."],
        });
      }
      if (effectiveDate < record.hireDate) {
        throw new ValidationError(undefined, {
          effectiveDate: ["La fecha efectiva no puede ser anterior al ingreso."],
        });
      }
    }

    const fileNumber = data.fileNumber ?? current.fileNumber;
    const updated = await repo.updateEmployeeVersioned(
      id,
      meta.version,
      { ...record, fileNumber, updatedById: ctx.userId },
      tx,
    );
    if (!updated) throw staleError();

    if (effectiveDate) {
      await repo.insertHistory(
        await historyRows(tx, current, updated, {
          employeeId: id,
          effectiveDate,
          notes: meta.changeNotes,
          actorId: ctx.userId,
        }),
        tx,
      );
    }

    const diff = auditDiff(auditable(current), auditable(updated));
    if (!diff) return;
    await recordAudit(
      ctx,
      {
        action: "UPDATE",
        module: MODULE,
        entityType: "Employee",
        entityId: id,
        ...diff,
        message: `Modificación de legajo ${updated.fileNumber}: ${updated.lastName}, ${updated.firstName}`,
      },
      tx,
    );
  });
}

function staleError() {
  return new ConflictError(
    "Otra persona modificó este legajo mientras lo editabas. Recargá la página para ver los cambios y volvé a aplicar los tuyos.",
  );
}

/**
 * Alta o cambio de la cuenta sueldo. El banco se deduce de los 3 primeros
 * dígitos del CBU, que tienen que corresponder a un banco activo del catálogo.
 */
export async function saveBankAccount(ctx: ActorContext, employeeId: string, input: unknown) {
  await assertPermission(ctx, "employee:write", MODULE);
  await assertPermission(ctx, "employee.bank:read", MODULE);
  const data = bankAccountSchema.parse(input);

  await repo.transaction(async (tx) => {
    const employee = await repo.findEmployee(employeeId, tx);
    if (!employee) throw new NotFoundError("El legajo no existe.");
    const bank = await repo.findBankByCode(data.cbu.slice(0, 3), tx);
    if (!bank || !bank.isActive) {
      throw new ValidationError(undefined, {
        cbu: [`El CBU corresponde al banco ${data.cbu.slice(0, 3)}, que no está en el catálogo de bancos activos.`],
      });
    }
    const accountType = await tx.lookupValue.findFirst({
      where: { id: data.accountTypeId, group: "TIPO_CUENTA_BANCARIA" },
    });
    if (!accountType) throw new ValidationError(undefined, { accountTypeId: ["Elegí el tipo de cuenta."] });

    const current = await repo.findBankAccount(employeeId, tx);
    const next = { bankId: bank.id, cbu: data.cbu, alias: data.alias, accountTypeId: data.accountTypeId };
    if (
      current &&
      current.cbu === next.cbu &&
      current.alias === next.alias &&
      current.accountTypeId === next.accountTypeId
    ) {
      return;
    }

    let effectiveDate: Date | null = null;
    if (current) {
      effectiveDate = data.effectiveDate ? parseIsoDate(data.effectiveDate) : todayInTimeZone();
      if (effectiveDate && effectiveDate > todayInTimeZone()) {
        throw new ValidationError(undefined, { effectiveDate: ["La fecha efectiva no puede ser futura."] });
      }
    }

    const saved = await repo.upsertBankAccount(employeeId, next, ctx.userId, tx);
    await repo.touchEmployee(employeeId, ctx.userId, tx);

    if (current && effectiveDate) {
      const describe = (a: { cbu: string; bankName: string }) => `${a.bankName} ${maskCbu(a.cbu)}`;
      await repo.insertHistory(
        [
          {
            employeeId,
            changeSetId: randomUUID(),
            changeType: "DATOS_BANCARIOS",
            field: "bankAccount",
            oldValue: describe({ cbu: current.cbu, bankName: current.bank.name }),
            newValue: describe({ cbu: saved.cbu, bankName: bank.name }),
            effectiveDate,
            notes: data.changeNotes,
            createdById: ctx.userId,
          },
        ],
        tx,
      );
    }

    const fields = (a: { bankId: string; cbu: string; alias: string | null; accountTypeId: string }) => ({
      bankId: a.bankId,
      cbu: a.cbu,
      alias: a.alias,
      accountTypeId: a.accountTypeId,
    });
    await recordAudit(
      ctx,
      {
        action: current ? "UPDATE" : "CREATE",
        module: MODULE,
        entityType: "EmployeeBankAccount",
        entityId: saved.id,
        ...(current ? (auditDiff(fields(current), fields(saved)) ?? {}) : { after: sanitizeForAudit(fields(saved)) }),
        message: `Datos bancarios del legajo ${employee.fileNumber}`,
      },
      tx,
    );
  });
}

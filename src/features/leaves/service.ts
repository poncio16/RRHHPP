import "server-only";
import { assertNoPresence, spanOf, syncWithLeaves } from "@/features/attendance/service";
import type { Prisma } from "@/generated/prisma/client";
import { formatDate, parseIsoDate, todayInTimeZone, toIsoDate } from "@/lib/format";
import { EXPORT_MAX_ROWS, type Column, type ReportResult } from "@/features/reports/table";
import { paginate } from "@/lib/list/query";
import { auditDiff, recordAudit } from "@/server/audit";
import { assertPermission, hasPermission } from "@/server/authz";
import type { ActorContext } from "@/server/context";
import { ConflictError, NotFoundError, ValidationError, type FieldErrors } from "@/server/errors";
import { getSetting } from "@/server/settings";
import {
  COUNTING_MODE_LABELS,
  LEAVE_CLASS_FILTER_LABELS,
  LEAVE_CLASS_LABELS,
  LEAVE_STATUS_FILTER_LABELS,
  LEAVE_STATUS_LABELS,
  LEAVE_TIMING_FILTER_LABELS,
  LEAVE_TIMING_LABELS,
  RESERVED_TYPE_LABEL,
  type LeaveClass,
} from "./constants";
import { countDays, defaultWorkDays, leaveTiming } from "./days";
import * as repo from "./repository";
import {
  annulLeaveSchema,
  leaveCreateOptionsSchema,
  leaveDecisionSchema,
  leaveEmployeeSchema,
  leaveListQuerySchema,
  leavePreviewSchema,
  leaveSchema,
  leaveVersionSchema,
  type LeaveData,
} from "./schemas";

const MODULE = "licencias";

/** Los tipos sensibles (enfermedad, accidente) son datos de salud: mismo permiso que la documentación médica. */
const canSeeHealth = (ctx: ActorContext) => hasPermission(ctx, "document.sensitive:read");
const leaveName = (ctx: ActorContext, type: { name: string; isSensitive: boolean }) =>
  type.isSensitive && !canSeeHealth(ctx) ? RESERVED_TYPE_LABEL : type.name;

/** Adjuntar el certificado desde el listado: registrar licencias y ver y registrar documentación. */
export function canAttachCertificate(ctx: ActorContext) {
  return (
    hasPermission(ctx, "leave:write") && hasPermission(ctx, "document:read") && hasPermission(ctx, "document:write")
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/* ----------------------------------------------------------------------------
 * Conteo de días
 * ------------------------------------------------------------------------- */

/** Días de la semana que trabaja el empleado: los de su horario o, sin horario, los del parámetro. */
export function workDaysOf(
  employee: { workSchedule: { days: { dayOfWeek: number }[] } | null },
  defaultCount: number,
): Set<number> {
  const days = employee.workSchedule?.days.map((d) => d.dayOfWeek) ?? [];
  return days.length > 0 ? new Set(days) : defaultWorkDays(defaultCount);
}

async function computeDays(
  employee: repo.EmployeeForLeave,
  type: Pick<repo.LeaveTypeRecord, "countingMode">,
  start: Date,
  end: Date,
  client?: Prisma.TransactionClient,
) {
  if (type.countingMode === "CORRIDOS") return countDays(start, end, "CORRIDOS", new Set(), new Set());
  const [{ defaultWorkDays: count }, holidays] = await Promise.all([
    getSetting("leaves"),
    repo.holidaysBetween(start, end, client),
  ]);
  return countDays(start, end, "HABILES", workDaysOf(employee, count), holidays);
}

/* ----------------------------------------------------------------------------
 * Validación de un período
 * ------------------------------------------------------------------------- */

type Period = Pick<LeaveData, "startDate" | "endDate" | "vacationBalanceId">;

type Evaluation = {
  start: Date;
  end: Date;
  days: number;
  vacationBalanceId: string | null;
  /** Problemas que impiden guardar, por campo. */
  fieldErrors: FieldErrors;
  /** Avisos que no impiden guardar (topes configurados, saldo). */
  warnings: string[];
  /** Saldo del período de vacaciones elegido, sin contar este registro. */
  balance: { year: number; total: number; used: number; requested: number } | null;
};

function addError(errors: FieldErrors, field: string, message: string) {
  (errors[field] ??= []).push(message);
}

/**
 * Cuenta los días y revisa el período: dentro de la relación laboral, sin
 * superponerse con otro registro vigente, con período de vacaciones si
 * corresponde. Los topes del tipo y el saldo solo generan avisos.
 */
async function evaluate(
  ctx: ActorContext,
  employee: repo.EmployeeForLeave,
  type: repo.LeaveTypeRecord,
  period: Period,
  excludeId: string | null,
  client?: Prisma.TransactionClient,
): Promise<Evaluation> {
  const start = parseIsoDate(period.startDate)!;
  const end = parseIsoDate(period.endDate)!;
  const fieldErrors: FieldErrors = {};
  const warnings: string[] = [];

  if (start < employee.hireDate) {
    addError(fieldErrors, "startDate", `No puede ser anterior al ingreso (${formatDate(employee.hireDate)}).`);
  }
  if (employee.exitDate && end > employee.exitDate) {
    addError(fieldErrors, "endDate", `No puede ser posterior al egreso (${formatDate(employee.exitDate)}).`);
  }

  const days = await computeDays(employee, type, start, end, client);
  if (days === 0) {
    addError(fieldErrors, "endDate", "El período no tiene días hábiles según el horario del empleado y los feriados.");
  }

  const overlap = await repo.findOverlapping(employee.id, start, end, ["SOLICITADA", "APROBADA"], excludeId, client);
  if (overlap) {
    addError(
      fieldErrors,
      "startDate",
      `Se superpone con ${leaveName(ctx, overlap.leaveType).toLowerCase()} del ${formatDate(overlap.startDate)} al ${formatDate(overlap.endDate)} (${LEAVE_STATUS_LABELS[overlap.status].toLowerCase()}).`,
    );
  }

  if (type.maxDaysPerEvent && days > type.maxDaysPerEvent) {
    warnings.push(`Supera el máximo configurado de ${plural(type.maxDaysPerEvent, "día", "días")} por vez.`);
  }
  if (type.maxDaysPerYear) {
    const year = start.getUTCFullYear();
    const previous = await repo.approvedDaysInYear(employee.id, type.id, year, excludeId, client);
    if (previous + days > type.maxDaysPerYear) {
      warnings.push(
        `Con este registro suma ${plural(previous + days, "día", "días")} de ${type.name.toLowerCase()} en ${year}; el máximo configurado es ${type.maxDaysPerYear}.`,
      );
    }
  }

  let balance: Evaluation["balance"] = null;
  let vacationBalanceId: string | null = null;
  if (type.class === "VACACIONES") {
    const found = period.vacationBalanceId ? await repo.findBalance(period.vacationBalanceId, client) : null;
    if (!found || found.employeeId !== employee.id) {
      addError(fieldErrors, "vacationBalanceId", "Elegí el período de vacaciones al que se imputan los días.");
    } else {
      vacationBalanceId = found.id;
      const usage = (await repo.balanceUsage([found.id], excludeId, client)).get(found.id)!;
      balance = {
        year: found.year,
        total: found.entitledDays + found.adjustmentDays + found.carriedOverDays,
        ...usage,
      };
      const available = balance.total - balance.used - balance.requested;
      if (days > available) {
        warnings.push(
          `Supera el saldo disponible del período ${found.year}: quedan ${plural(Math.max(available, 0), "día", "días")} sin usar ni solicitar.`,
        );
      }
    }
  }

  return { start, end, days, vacationBalanceId, fieldErrors, warnings, balance };
}

function throwIfInvalid(evaluation: Evaluation) {
  const messages = Object.values(evaluation.fieldErrors).flat();
  if (messages.length > 0) throw new ValidationError(messages[0], evaluation.fieldErrors);
}

/** Al aprobar, los días aprobados no pueden superar el saldo del período. */
function assertBalanceForApproval(evaluation: Evaluation) {
  const { balance, days } = evaluation;
  if (!balance) return;
  const available = balance.total - balance.used;
  if (days > available) {
    throw new ConflictError(
      `No alcanza el saldo del período ${balance.year}: quedan ${plural(Math.max(available, 0), "día", "días")} y se piden ${days}. Ajustá el saldo o elegí otro período.`,
      { vacationBalanceId: ["Saldo insuficiente para aprobar."] },
    );
  }
}

/* ----------------------------------------------------------------------------
 * Lectura
 * ------------------------------------------------------------------------- */

function toListItem(row: repo.LeaveRecordRow, today: Date, healthVisible: boolean) {
  const hidden = row.leaveType.isSensitive && !healthVisible;
  const certificateCount = row.documents.filter((d) => healthVisible || !d.documentType.isSensitive).length;
  return {
    id: row.id,
    employee: row.employee,
    leaveType: {
      name: hidden ? RESERVED_TYPE_LABEL : row.leaveType.name,
      class: row.leaveType.class as LeaveClass,
      isSensitive: row.leaveType.isSensitive,
      countingMode: row.leaveType.countingMode,
    },
    /** Sin permiso de datos de salud, el registro se ve pero no se puede tocar ni ver su detalle. */
    hidden,
    startDate: row.startDate,
    endDate: row.endDate,
    days: row.days,
    status: row.status,
    timing: leaveTiming(row.startDate, row.endDate, today),
    vacationYear: row.vacationBalance?.year ?? null,
    notes: hidden ? null : row.notes,
    decisionNotes: hidden ? null : row.decisionNotes,
    requestedBy: row.requestedBy.name,
    decidedBy: row.decidedBy?.name ?? null,
    decidedAt: row.decidedAt,
    certificate: row.leaveType.requiresCertificate
      ? hidden
        ? null
        : certificateCount > 0
          ? ("PRESENTADO" as const)
          : ("FALTA" as const)
      : null,
    version: row.updatedAt.toISOString(),
    formValues: hidden
      ? null
      : {
          leaveTypeId: row.leaveTypeId,
          startDate: toIsoDate(row.startDate),
          endDate: toIsoDate(row.endDate),
          vacationBalanceId: row.vacationBalanceId ?? "",
          notes: row.notes ?? "",
        },
  };
}

export type LeaveListItem = ReturnType<typeof toListItem>;

/**
 * Registros de un empleado (`employeeId`) o de todos; `onlyClass` limita a
 * una clase (la vista de Vacaciones). Los tipos sensibles se muestran como
 * licencia reservada a quien no puede ver datos de salud.
 */
export async function listLeaves(
  ctx: ActorContext,
  rawQuery: unknown,
  scope: { employeeId?: string; onlyClass?: LeaveClass } = {},
) {
  await assertPermission(ctx, "leave:read", MODULE);
  const query = leaveListQuerySchema.parse(rawQuery);
  const today = todayInTimeZone();
  const healthVisible = canSeeHealth(ctx);
  const { items, total } = await repo.listLeaves(query, { ...scope, includeSensitive: healthVisible, today });
  return {
    ...paginate(
      items.map((row) => toListItem(row, today, healthVisible)),
      total,
      query.page,
      query.pageSize,
    ),
    query,
  };
}

const fullName = (e: { lastName: string; firstName: string }) => `${e.lastName}, ${e.firstName}`;

/**
 * Listado exportable con los mismos filtros, orden y reservas que la pantalla
 * (`onlyClass` para Vacaciones): sin permiso de datos de salud, los tipos
 * sensibles salen como licencia reservada y sin observaciones.
 */
async function exportLeaveList(
  ctx: ActorContext,
  rawQuery: unknown,
  view: { title: string; id: string; onlyClass?: LeaveClass },
): Promise<ReportResult> {
  await assertPermission(ctx, "leave:read", MODULE);
  const query = leaveListQuerySchema.parse(rawQuery);
  const today = todayInTimeZone();
  const healthVisible = canSeeHealth(ctx);
  const [records, type] = await Promise.all([
    repo.listLeavesForExport(
      query,
      { onlyClass: view.onlyClass, includeSensitive: healthVisible, today },
      EXPORT_MAX_ROWS,
    ),
    query.leaveTypeId ? repo.findLeaveType(query.leaveTypeId) : null,
  ]);
  const items = records.map((row) => toListItem(row, today, healthVisible));
  const allClasses = !view.onlyClass;
  const columns: Column[] = [
    { key: "legajo", label: "Legajo", type: "int" },
    { key: "empleado", label: "Empleado" },
    { key: "tipo", label: "Tipo" },
    ...(allClasses ? [{ key: "clase", label: "Clase" }] : []),
    { key: "periodo", label: "Período de vacaciones", type: "int" as const },
    { key: "desde", label: "Desde", type: "date" as const },
    { key: "hasta", label: "Hasta", type: "date" as const },
    { key: "dias", label: "Días", type: "int" as const },
    { key: "computo", label: "Cómputo" },
    { key: "estado", label: "Estado" },
    { key: "momento", label: "Momento" },
    ...(allClasses ? [{ key: "certificado", label: "Certificado" }] : []),
    { key: "cargo", label: "Cargó" },
    { key: "decidio", label: "Aprobó o rechazó" },
    { key: "observaciones", label: "Observaciones" },
    { key: "decision", label: "Observaciones de la decisión" },
  ];
  return {
    title: view.title,
    filters: [
      `Estado: ${LEAVE_STATUS_FILTER_LABELS[query.status]}`,
      ...(allClasses && query.class ? [`Clase: ${LEAVE_CLASS_FILTER_LABELS[query.class]}`] : []),
      ...(type ? [`Tipo: ${leaveName(ctx, type)}`] : []),
      ...(allClasses && query.certificado ? ["Falta el certificado"] : []),
      ...(query.timing ? [`Momento: ${LEAVE_TIMING_FILTER_LABELS[query.timing]}`] : []),
      ...(query.desde || query.hasta
        ? [
            `Período: ${[
              query.desde && `desde el ${formatDate(parseIsoDate(query.desde)!)}`,
              query.hasta && `hasta el ${formatDate(parseIsoDate(query.hasta)!)}`,
            ]
              .filter(Boolean)
              .join(" ")}`,
          ]
        : []),
      ...(query.q ? [`Búsqueda: ${query.q}`] : []),
      ...(items.length === EXPORT_MAX_ROWS ? [`Se exportaron las primeras ${EXPORT_MAX_ROWS} filas.`] : []),
    ],
    tables: [
      {
        id: view.id,
        title: view.title,
        columns,
        rows: items.map((item) => {
          const active = item.status === "SOLICITADA" || item.status === "APROBADA";
          return {
            legajo: item.employee.fileNumber,
            empleado: fullName(item.employee),
            tipo: item.leaveType.name,
            ...(allClasses ? { clase: LEAVE_CLASS_LABELS[item.leaveType.class] } : {}),
            periodo: item.vacationYear,
            desde: item.startDate,
            hasta: item.endDate,
            dias: item.days,
            computo: COUNTING_MODE_LABELS[item.leaveType.countingMode],
            estado: LEAVE_STATUS_LABELS[item.status],
            momento: active ? LEAVE_TIMING_LABELS[item.timing] : null,
            ...(allClasses
              ? { certificado: active && item.certificate ? CERTIFICATE_LABELS[item.certificate] : null }
              : {}),
            cargo: item.requestedBy,
            decidio: item.decidedBy,
            observaciones: item.notes,
            decision: item.decisionNotes,
          };
        }),
        empty: "No hay registros con estos filtros.",
      },
    ],
  };
}

const CERTIFICATE_LABELS = { PRESENTADO: "Presentado", FALTA: "Falta" } as const;

/** Licencias y ausencias (/licencias) para Excel o CSV. */
export function exportLeaves(ctx: ActorContext, rawQuery: unknown) {
  return exportLeaveList(ctx, rawQuery, { title: "Licencias y ausencias", id: "licencias" });
}

/** Vacaciones (/vacaciones) para Excel o CSV. */
export function exportVacations(ctx: ActorContext, rawQuery: unknown) {
  return exportLeaveList(ctx, rawQuery, { title: "Vacaciones", id: "vacaciones", onlyClass: "VACACIONES" });
}

/** Tipos visibles para el usuario, para filtros y formularios. */
export async function getLeaveTypeOptions(ctx: ActorContext, includeIds: string[] = []) {
  await assertPermission(ctx, "leave:read", MODULE);
  return repo.listTypeOptions(canSeeHealth(ctx), includeIds);
}

export type LeaveTypeOption = Awaited<ReturnType<typeof getLeaveTypeOptions>>[number];

/** Empleados no egresados, para elegir a quién corresponde un registro nuevo. */
export async function getEmployeeOptions(ctx: ActorContext) {
  await assertPermission(ctx, "leave:write", MODULE);
  return repo.listEmployeeOptions();
}

/**
 * Períodos de vacaciones del empleado con su saldo disponible, para imputar
 * un registro. `excludeId` es el registro que se edita.
 */
export async function getBalanceOptions(ctx: ActorContext, employeeId: string, excludeId: string | null = null) {
  await assertPermission(ctx, "leave:write", MODULE);
  const balances = await repo.listEmployeeBalances(employeeId);
  const usage = await repo.balanceUsage(
    balances.map((b) => b.id),
    excludeId,
  );
  return balances.map((b) => {
    const { used, requested } = usage.get(b.id)!;
    const available = b.entitledDays + b.adjustmentDays + b.carriedOverDays - used - requested;
    return {
      id: b.id,
      year: b.year,
      available,
      label: `${b.year} (${plural(available, "día disponible", "días disponibles")})`,
    };
  });
}

export type BalanceOption = Awaited<ReturnType<typeof getBalanceOptions>>[number];

/** Suspensión aprobada vigente hoy: el legajo se muestra como suspendido hasta su fin. */
export async function getActiveSuspension(ctx: ActorContext, employeeId: string) {
  if (!hasPermission(ctx, "employee:read")) return null;
  return repo.findActiveSuspension(employeeId, todayInTimeZone());
}

/**
 * Cálculo previo mientras se completa el formulario: días, avisos y
 * problemas que impedirían guardar. No escribe nada.
 */
export async function previewLeave(ctx: ActorContext, input: unknown) {
  await assertPermission(ctx, "leave:write", MODULE);
  const parsed = leavePreviewSchema.parse(input);
  const employee = await repo.findEmployeeForLeave(parsed.employeeId);
  const type = await repo.findLeaveType(parsed.leaveTypeId);
  if (!employee || !type || (type.isSensitive && !canSeeHealth(ctx))) throw new NotFoundError();
  if (parseIsoDate(parsed.endDate)! < parseIsoDate(parsed.startDate)!) return null;
  const evaluation = await evaluate(
    ctx,
    employee,
    type,
    { startDate: parsed.startDate, endDate: parsed.endDate, vacationBalanceId: parsed.vacationBalanceId ?? null },
    parsed.excludeId ?? null,
  );
  return {
    days: evaluation.days,
    countingMode: COUNTING_MODE_LABELS[type.countingMode].toLowerCase(),
    problems: Object.values(evaluation.fieldErrors).flat(),
    warnings: evaluation.warnings,
  };
}

/* ----------------------------------------------------------------------------
 * Escritura
 * ------------------------------------------------------------------------- */

async function validateType(ctx: ActorContext, leaveTypeId: string, currentTypeId?: string) {
  const type = await repo.findLeaveType(leaveTypeId);
  if (!type || (!type.isActive && type.id !== currentTypeId)) {
    throw new ValidationError(undefined, { leaveTypeId: ["El tipo no existe o está inactivo."] });
  }
  if (type.isSensitive) await assertPermission(ctx, "document.sensitive:read", MODULE);
  return type;
}

function auditable(record: {
  leaveTypeId: string;
  startDate: Date;
  endDate: Date;
  days: number;
  status: string;
  vacationBalanceId: string | null;
  notes: string | null;
}) {
  return {
    leaveTypeId: record.leaveTypeId,
    startDate: toIsoDate(record.startDate),
    endDate: toIsoDate(record.endDate),
    days: record.days,
    status: record.status,
    vacationBalanceId: record.vacationBalanceId,
    notes: record.notes,
  };
}

const describe = (type: { name: string }, employee: { lastName: string; firstName: string }, start: Date, end: Date) =>
  `${type.name} de ${employee.lastName}, ${employee.firstName} del ${formatDate(start)} al ${formatDate(end)}`;

/**
 * Alta de una licencia, ausencia, vacaciones o suspensión. `employeeId` viene
 * de la URL o, desde un listado general, del formulario. Queda solicitada,
 * salvo que quien puede aprobar la registre directamente como aprobada.
 */
export async function createLeave(ctx: ActorContext, employeeId: string | null, input: unknown) {
  await assertPermission(ctx, "leave:write", MODULE);
  const targetId = employeeId ?? leaveEmployeeSchema.parse(input).employeeId;
  const data = leaveSchema.parse(input);
  const { approve } = leaveCreateOptionsSchema.parse(input);
  if (approve) await assertPermission(ctx, "leave:approve", MODULE);
  const employee = await repo.findEmployeeForLeave(targetId);
  if (!employee) throw new NotFoundError("El legajo no existe.");
  if (employee.status === "EGRESADO") throw new ConflictError("El empleado está egresado.");
  const type = await validateType(ctx, data.leaveTypeId);

  return repo.transaction(async (tx) => {
    await repo.lockEmployee(employee.id, tx);
    const evaluation = await evaluate(ctx, employee, type, data, null, tx);
    throwIfInvalid(evaluation);
    if (approve) {
      assertBalanceForApproval(evaluation);
      await assertNoPresence(employee.id, evaluation.start, evaluation.end, tx);
    }
    const record = await repo.createLeave(
      {
        employeeId: employee.id,
        leaveTypeId: type.id,
        startDate: evaluation.start,
        endDate: evaluation.end,
        days: evaluation.days,
        vacationBalanceId: evaluation.vacationBalanceId,
        notes: data.notes,
        status: approve ? "APROBADA" : "SOLICITADA",
        requestedById: ctx.userId,
        ...(approve ? { decidedById: ctx.userId, decidedAt: new Date() } : {}),
        updatedById: ctx.userId,
      },
      tx,
    );
    await recordAudit(
      ctx,
      {
        action: "CREATE",
        module: MODULE,
        entityType: "LeaveRecord",
        entityId: record.id,
        after: { employeeId: employee.id, ...auditable(record) },
        message: `${approve ? "Registro aprobado" : "Solicitud"}: ${describe(type, employee, record.startDate, record.endDate)}`,
      },
      tx,
    );
    if (approve) await syncWithLeaves(employee.id, record.startDate, record.endDate, tx);
    return { id: record.id, warnings: evaluation.warnings };
  });
}

async function loadForChange(ctx: ActorContext, id: string) {
  const record = await repo.findLeave(id);
  if (!record) throw new NotFoundError("El registro no existe.");
  if (record.leaveType.isSensitive) await assertPermission(ctx, "document.sensitive:read", MODULE);
  const employee = await repo.findEmployeeForLeave(record.employeeId);
  return { record, employee: employee! };
}

const conflict = () =>
  new ConflictError(
    "Otra persona modificó este registro mientras lo editabas. Cerrá el formulario y volvé a abrirlo para ver los cambios.",
  );

/**
 * Edición del período, tipo u observaciones. Una solicitud la edita quien
 * registra; un registro ya aprobado (por ejemplo, un alta anticipada) solo
 * quien además puede aprobar, y sigue aprobado.
 */
export async function updateLeave(ctx: ActorContext, id: string, input: unknown) {
  await assertPermission(ctx, "leave:write", MODULE);
  const { version } = leaveVersionSchema.parse(input);
  const data = leaveSchema.parse(input);
  const { record, employee } = await loadForChange(ctx, id);
  if (record.status !== "SOLICITADA" && record.status !== "APROBADA") {
    throw new ConflictError(
      `El registro está ${LEAVE_STATUS_LABELS[record.status].toLowerCase()} y no se puede modificar.`,
    );
  }
  if (record.status === "APROBADA") await assertPermission(ctx, "leave:approve", MODULE);
  const type = await validateType(ctx, data.leaveTypeId, record.leaveTypeId);

  const warnings = await repo.transaction(async (tx) => {
    await repo.lockEmployee(employee.id, tx);
    const evaluation = await evaluate(ctx, employee, type, data, id, tx);
    throwIfInvalid(evaluation);
    if (record.status === "APROBADA") {
      assertBalanceForApproval(evaluation);
      await assertNoPresence(employee.id, evaluation.start, evaluation.end, tx);
    }
    const next = {
      leaveTypeId: type.id,
      startDate: evaluation.start,
      endDate: evaluation.end,
      days: evaluation.days,
      vacationBalanceId: evaluation.vacationBalanceId,
      notes: data.notes,
    };
    const ok = await repo.updateLeaveVersioned(id, new Date(version), { ...next, updatedById: ctx.userId }, tx);
    if (!ok) throw conflict();
    const diff = auditDiff(auditable(record), auditable({ ...next, status: record.status }));
    if (diff) {
      await recordAudit(
        ctx,
        {
          action: "UPDATE",
          module: MODULE,
          entityType: "LeaveRecord",
          entityId: id,
          ...diff,
          message: `Modificación: ${describe(type, employee, next.startDate, next.endDate)}`,
        },
        tx,
      );
    }
    if (record.status === "APROBADA") {
      const range = spanOf(
        { start: record.startDate, end: record.endDate },
        { start: next.startDate, end: next.endDate },
      );
      await syncWithLeaves(employee.id, range.start, range.end, tx);
    }
    return evaluation.warnings;
  });
  return { warnings };
}

/**
 * Aprobación o rechazo de una solicitud. Al aprobar se vuelven a contar los
 * días (pudo cargarse un feriado) y se revisan solapamientos y saldo.
 */
export async function decideLeave(ctx: ActorContext, id: string, input: unknown) {
  await assertPermission(ctx, "leave:approve", MODULE);
  const { version } = leaveVersionSchema.parse(input);
  const { decision, notes } = leaveDecisionSchema.parse(input);
  const { record, employee } = await loadForChange(ctx, id);
  if (record.status !== "SOLICITADA") {
    throw new ConflictError(`La solicitud ya está ${LEAVE_STATUS_LABELS[record.status].toLowerCase()}.`);
  }

  await repo.transaction(async (tx) => {
    await repo.lockEmployee(employee.id, tx);
    let days = record.days;
    if (decision === "APROBADA") {
      const evaluation = await evaluate(
        ctx,
        employee,
        record.leaveType,
        {
          startDate: toIsoDate(record.startDate),
          endDate: toIsoDate(record.endDate),
          vacationBalanceId: record.vacationBalanceId,
        },
        id,
        tx,
      );
      throwIfInvalid(evaluation);
      assertBalanceForApproval(evaluation);
      await assertNoPresence(employee.id, evaluation.start, evaluation.end, tx);
      days = evaluation.days;
    }
    const ok = await repo.updateLeaveVersioned(
      id,
      new Date(version),
      {
        status: decision,
        days,
        decisionNotes: notes,
        decidedById: ctx.userId,
        decidedAt: new Date(),
        updatedById: ctx.userId,
      },
      tx,
    );
    if (!ok) throw conflict();
    await recordAudit(
      ctx,
      {
        action: "UPDATE",
        module: MODULE,
        entityType: "LeaveRecord",
        entityId: id,
        before: { status: record.status, days: record.days },
        after: { status: decision, days, decisionNotes: notes },
        message: `${decision === "APROBADA" ? "Aprobación" : "Rechazo"}: ${describe(record.leaveType, employee, record.startDate, record.endDate)}`,
      },
      tx,
    );
    if (decision === "APROBADA") await syncWithLeaves(employee.id, record.startDate, record.endDate, tx);
  });
}

/** Baja lógica: el registro queda anulado, con el motivo en las observaciones de la decisión. */
export async function annulLeave(ctx: ActorContext, id: string, input: unknown) {
  await assertPermission(ctx, "leave:write", MODULE);
  const { version } = leaveVersionSchema.parse(input);
  const { reason } = annulLeaveSchema.parse(input);
  const { record, employee } = await loadForChange(ctx, id);
  if (record.status !== "SOLICITADA" && record.status !== "APROBADA") {
    throw new ConflictError(`El registro ya está ${LEAVE_STATUS_LABELS[record.status].toLowerCase()}.`);
  }
  const stamp = `Anulada el ${formatDate(todayInTimeZone())}: ${reason}`;
  const decisionNotes = record.decisionNotes ? `${record.decisionNotes}\n${stamp}` : stamp;

  await repo.transaction(async (tx) => {
    const ok = await repo.updateLeaveVersioned(
      id,
      new Date(version),
      { status: "ANULADA", decisionNotes, updatedById: ctx.userId },
      tx,
    );
    if (!ok) throw conflict();
    await recordAudit(
      ctx,
      {
        action: "SOFT_DELETE",
        module: MODULE,
        entityType: "LeaveRecord",
        entityId: id,
        before: { status: record.status },
        after: { status: "ANULADA", reason },
        message: `Anulación: ${describe(record.leaveType, employee, record.startDate, record.endDate)}`,
      },
      tx,
    );
    if (record.status === "APROBADA") await syncWithLeaves(employee.id, record.startDate, record.endDate, tx);
  });
}

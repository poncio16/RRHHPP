import "server-only";
import { defaultWorkDays as weekdaysFromMonday } from "@/features/leaves/days";
import { RESERVED_TYPE_LABEL } from "@/features/leaves/constants";
import * as leaves from "@/features/leaves/repository";
import type { Prisma } from "@/generated/prisma/client";
import { formatDate, formatTime, parseIsoDate, todayInTimeZone, toIsoDate } from "@/lib/format";
import { paginate } from "@/lib/list/query";
import { auditDiff, recordAudit } from "@/server/audit";
import { assertPermission, hasPermission } from "@/server/authz";
import type { ActorContext } from "@/server/context";
import { ConflictError, NotFoundError, ValidationError, type FieldErrors } from "@/server/errors";
import { getSetting } from "@/server/settings";
import {
  attendanceMinutes,
  attendanceStatus,
  dayPlan,
  formatMinutes,
  isWorkday,
  planLabel,
  shiftInstants,
  spanMinutes,
  type DayPlan,
} from "./calc";
import { ATTENDANCE_STATUS_LABELS, type AttendanceStatus } from "./constants";
import * as repo from "./repository";
import {
  attendanceDaySchema,
  attendanceEmployeeSchema,
  attendanceListQuerySchema,
  attendanceSheetSchema,
  attendanceVersionSchema,
  monthQuerySchema,
  sheetQuerySchema,
} from "./schemas";

const MODULE = "asistencia";

/** El nombre de una licencia por enfermedad o accidente es un dato de salud. */
const canSeeHealth = (ctx: ActorContext) => hasPermission(ctx, "document.sensitive:read");

const leaveName = (ctx: ActorContext, type: { name: string; isSensitive: boolean }) =>
  type.isSensitive && !canSeeHealth(ctx) ? RESERVED_TYPE_LABEL : type.name;

const fullName = (e: { lastName: string; firstName: string }) => `${e.lastName}, ${e.firstName}`;

/* ----------------------------------------------------------------------------
 * Cálculo de un día
 * ------------------------------------------------------------------------- */

type DayContext = {
  lateToleranceMinutes: number;
  extraMinimumMinutes: number;
  defaultWorkDays: Set<number>;
  holidays: Map<string, { name: string }>;
  leaves: repo.CoveringLeave[];
};

async function loadContext(
  employeeIds: string[],
  start: Date,
  end: Date,
  client?: Prisma.TransactionClient,
): Promise<DayContext> {
  const [attendance, leaves, holidays, covering] = await Promise.all([
    getSetting("attendance"),
    getSetting("leaves"),
    repo.holidaysBetween(start, end, client),
    repo.approvedLeavesBetween(employeeIds, start, end, client),
  ]);
  return {
    ...attendance,
    defaultWorkDays: weekdaysFromMonday(leaves.defaultWorkDays),
    holidays,
    leaves: covering,
  };
}

function planOf(employee: repo.AttendanceEmployee, date: Date, context: DayContext): DayPlan {
  return dayPlan(
    date,
    employee.workSchedule?.days ?? null,
    context.defaultWorkDays,
    context.holidays.get(toIsoDate(date)) ?? null,
  );
}

const leaveOn = (employeeId: string, date: Date, context: DayContext) =>
  context.leaves.find((l) => l.employeeId === employeeId && l.startDate <= date && l.endDate >= date);

type DayFields = { checkIn: string | null; checkOut: string | null; breakMinutes: number | null; notes: string | null };

type EvaluatedDay = {
  status: AttendanceStatus;
  checkIn: Date | null;
  checkOut: Date | null;
  breakMinutes: number;
  workedMinutes: number;
  regularMinutes: number;
  extraMinutes: number;
  lateMinutes: number;
  leaveRecordId: string | null;
  notes: string | null;
};

function inEmployment(employee: repo.AttendanceEmployee, date: Date) {
  return employee.hireDate <= date && (!employee.exitDate || employee.exitDate >= date);
}

/**
 * Valida y calcula un día. Los errores se agregan con el prefijo indicado
 * (para las filas de la planilla). No se puede fichar un día cubierto por
 * una licencia aprobada: primero hay que modificar o anular la licencia.
 */
function evaluateDay(
  employee: repo.AttendanceEmployee,
  date: Date,
  fields: DayFields,
  context: DayContext,
  errors: FieldErrors,
  prefix = "",
): EvaluatedDay | null {
  const add = (field: string, message: string) => (errors[`${prefix}${field}`] ??= []).push(message);
  if (!inEmployment(employee, date)) {
    add(prefix ? "checkIn" : "date", "El empleado no estaba en relación laboral ese día.");
    return null;
  }
  const plan = planOf(employee, date, context);
  const leave = leaveOn(employee.id, date, context);
  const hasTimes = !!fields.checkIn && !!fields.checkOut;
  if (leave && hasTimes) {
    add(
      "checkIn",
      `El día está cubierto por ${leave.leaveType.name.toLowerCase()} aprobada (${formatDate(leave.startDate)} al ${formatDate(leave.endDate)}). Para cargar la fichada, modificá o anulá ese registro.`,
    );
    return null;
  }
  const base = {
    status: attendanceStatus(plan, hasTimes, !!leave),
    leaveRecordId: leave?.id ?? null,
    notes: fields.notes,
  };
  if (!hasTimes) {
    return {
      ...base,
      checkIn: null,
      checkOut: null,
      breakMinutes: 0,
      workedMinutes: 0,
      regularMinutes: 0,
      extraMinutes: 0,
      lateMinutes: 0,
    };
  }
  const instants = shiftInstants(date, fields.checkIn!, fields.checkOut!);
  const breakMinutes = fields.breakMinutes ?? (plan.kind === "turno" ? plan.slot.breakMinutes : 0);
  if (breakMinutes >= spanMinutes(instants.checkIn, instants.checkOut)) {
    add(
      "breakMinutes",
      `El descanso del horario (${breakMinutes} min) no entra entre la entrada y la salida: indicá el descanso.`,
    );
    return null;
  }
  const minutes = attendanceMinutes({
    date,
    ...instants,
    breakMinutes,
    plan,
    lateToleranceMinutes: context.lateToleranceMinutes,
    extraMinimumMinutes: context.extraMinimumMinutes,
  });
  return {
    ...base,
    ...instants,
    breakMinutes,
    workedMinutes: minutes.worked,
    regularMinutes: minutes.regular,
    extraMinutes: minutes.extra,
    lateMinutes: minutes.late,
  };
}

function assertNotFuture(date: Date, field: string) {
  if (date > todayInTimeZone()) {
    throw new ValidationError(undefined, { [field]: ["No se puede cargar asistencia de días futuros."] });
  }
}

/* ----------------------------------------------------------------------------
 * Vistas
 * ------------------------------------------------------------------------- */

function toItem(ctx: ActorContext, row: repo.AttendanceRow) {
  const checkIn = formatTime(row.checkIn);
  const checkOut = formatTime(row.checkOut);
  return {
    id: row.id,
    date: row.date,
    employee: row.employee,
    checkIn,
    checkOut,
    /** La salida es del día siguiente (turno que cruza la medianoche). */
    nextDay: !!row.checkOut && toIsoDate(todayInTimeZone(undefined, row.checkOut)) !== toIsoDate(row.date),
    breakMinutes: row.breakMinutes,
    workedMinutes: row.workedMinutes,
    regularMinutes: row.regularMinutes,
    extraMinutes: row.extraMinutes,
    lateMinutes: row.lateMinutes,
    status: row.status,
    leave: row.leaveRecord ? leaveName(ctx, row.leaveRecord.leaveType) : null,
    notes: row.notes,
    source: row.source,
    version: row.updatedAt.toISOString(),
    formValues: {
      date: toIsoDate(row.date),
      checkIn,
      checkOut,
      breakMinutes: row.checkIn ? String(row.breakMinutes) : "",
      notes: row.notes ?? "",
    },
  };
}

export type AttendanceItem = ReturnType<typeof toItem>;

type Summary = Awaited<ReturnType<typeof repo.listDays>>;

function toSummary(result: Pick<Summary, "sums" | "byStatus" | "lateDays">) {
  const count = (status: AttendanceStatus) => result.byStatus.find((s) => s.status === status)?._count._all ?? 0;
  return {
    present: count("PRESENTE"),
    absent: count("AUSENTE"),
    onLeave: count("JUSTIFICADO"),
    rest: count("FRANCO") + count("FERIADO"),
    workedMinutes: result.sums.workedMinutes ?? 0,
    regularMinutes: result.sums.regularMinutes ?? 0,
    extraMinutes: result.sums.extraMinutes ?? 0,
    lateMinutes: result.sums.lateMinutes ?? 0,
    lateDays: result.lateDays,
  };
}

export type AttendanceSummary = ReturnType<typeof toSummary>;

/** Registros de asistencia (todo el personal o un legajo), con los totales del filtro. */
export async function listDays(ctx: ActorContext, rawQuery: unknown, scope: { employeeId?: string } = {}) {
  await assertPermission(ctx, "attendance:read", MODULE);
  const query = attendanceListQuerySchema.parse(rawQuery);
  const result = await repo.listDays(query, scope.employeeId);
  return {
    ...paginate(
      result.items.map((row) => toItem(ctx, row)),
      result.total,
      query.page,
      query.pageSize,
    ),
    summary: toSummary(result),
    query,
  };
}

/** Personal sin egreso, para elegir en el formulario del listado general. */
export async function getEmployeeOptions(ctx: ActorContext) {
  await assertPermission(ctx, "attendance:write", MODULE);
  return leaves.listEmployeeOptions();
}

export async function getDepartmentOptions(ctx: ActorContext) {
  await assertPermission(ctx, "attendance:read", MODULE);
  return repo.listDepartments();
}

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;

/** Asistencia de un mes del legajo, con sus totales y los meses vecinos para navegar. */
export async function getEmployeeMonth(ctx: ActorContext, employeeId: string, rawQuery: unknown) {
  await assertPermission(ctx, "attendance:read", MODULE);
  const today = todayInTimeZone();
  const { mes } = monthQuerySchema.parse(rawQuery);
  const [year, month] = mes
    ? (mes.split("-").map(Number) as [number, number])
    : [today.getUTCFullYear(), today.getUTCMonth() + 1];
  const first = new Date(Date.UTC(year, month - 1, 1));
  const last = new Date(Date.UTC(year, month, 0));
  const query = attendanceListQuerySchema.parse({
    desde: toIsoDate(first),
    hasta: toIsoDate(last),
    pageSize: 100,
  });
  const result = await repo.listDays(query, employeeId);
  const prev = new Date(Date.UTC(year, month - 2, 1));
  const next = new Date(Date.UTC(year, month, 1));
  return {
    label: `${MONTHS[month - 1]} de ${year}`,
    items: result.items.map((row) => toItem(ctx, row)),
    summary: toSummary(result),
    prev: monthKey(prev.getUTCFullYear(), prev.getUTCMonth() + 1),
    next: next <= today ? monthKey(next.getUTCFullYear(), next.getUTCMonth() + 1) : null,
  };
}

/**
 * Planilla de un día: el personal en relación laboral ese día (de un sector,
 * si se elige), con lo que se esperaba de cada uno y lo ya cargado.
 */
export async function getSheet(ctx: ActorContext, rawQuery: unknown) {
  await assertPermission(ctx, "attendance:read", MODULE);
  const query = sheetQuerySchema.parse(rawQuery);
  const today = todayInTimeZone();
  const requested = query.fecha ? parseIsoDate(query.fecha)! : today;
  const date = requested > today ? today : requested;
  const employees = await repo.employeesOn(date, { departmentId: query.sector, q: query.q });
  const ids = employees.map((e) => e.id);
  const [context, days] = await Promise.all([loadContext(ids, date, date), repo.daysOn(ids, date)]);
  const byEmployee = new Map(days.map((d) => [d.employeeId, d]));
  const rows = employees.map((employee) => {
    const plan = planOf(employee, date, context);
    const leave = leaveOn(employee.id, date, context);
    const record = byEmployee.get(employee.id);
    return {
      employee: {
        id: employee.id,
        name: fullName(employee),
        fileNumber: employee.fileNumber,
        department: employee.department.name,
      },
      plan: planLabel(plan),
      workday: isWorkday(plan),
      defaultBreak: plan.kind === "turno" ? plan.slot.breakMinutes : 0,
      leave: leave ? leaveName(ctx, leave.leaveType) : null,
      record: record ? toItem(ctx, record) : null,
    };
  });
  const latest = Math.max(0, ...days.map((d) => d.updatedAt.getTime()));
  return {
    date: toIsoDate(date),
    isToday: date.getTime() === today.getTime(),
    /** Cambia cuando se guarda algo: la planilla se vuelve a armar con lo guardado. */
    stamp: [toIsoDate(date), query.sector ?? "", query.q ?? "", days.length, latest].join("|"),
    query,
    rows,
    canEdit: hasPermission(ctx, "attendance:write"),
  };
}

export type SheetRow = Awaited<ReturnType<typeof getSheet>>["rows"][number];

/* ----------------------------------------------------------------------------
 * Escritura
 * ------------------------------------------------------------------------- */

function auditable(day: {
  date: Date;
  checkIn: Date | null;
  checkOut: Date | null;
  breakMinutes: number;
  status: string;
  notes: string | null;
}) {
  return {
    date: toIsoDate(day.date),
    checkIn: day.checkIn ? formatTime(day.checkIn) : null,
    checkOut: day.checkOut ? formatTime(day.checkOut) : null,
    breakMinutes: day.breakMinutes,
    status: day.status,
    notes: day.notes,
  };
}

const describe = (employee: { lastName: string; firstName: string }, date: Date, status: AttendanceStatus) =>
  `Asistencia de ${fullName(employee)} del ${formatDate(date)}: ${ATTENDANCE_STATUS_LABELS[status].toLowerCase()}`;

const conflictFor = (employee: { lastName: string; firstName: string }) =>
  new ConflictError(
    `Otra persona cargó o modificó la asistencia de ${fullName(employee)} mientras editabas. Volvé a abrir el formulario para ver los cambios.`,
  );

/**
 * Guarda un día ya evaluado: lo crea, o lo actualiza si `version` coincide
 * con la del registro existente.
 */
async function persist(
  ctx: ActorContext,
  employee: repo.AttendanceEmployee,
  date: Date,
  day: EvaluatedDay,
  version: string | null,
  tx: Prisma.TransactionClient,
) {
  const existing = await repo.findDay(employee.id, date, tx);
  const data = { ...day, updatedById: ctx.userId };
  if (!existing) {
    if (version) throw conflictFor(employee);
    const created = await repo.createDay(
      { ...data, employeeId: employee.id, date, source: "MANUAL", createdById: ctx.userId },
      tx,
    );
    await recordAudit(
      ctx,
      {
        action: "CREATE",
        module: MODULE,
        entityType: "AttendanceDay",
        entityId: created.id,
        after: { employeeId: employee.id, ...auditable(created) },
        message: describe(employee, date, created.status),
      },
      tx,
    );
    return;
  }
  if (!version || existing.updatedAt.toISOString() !== version) throw conflictFor(employee);
  const ok = await repo.updateDayVersioned(existing.id, existing.updatedAt, data, tx);
  if (!ok) throw conflictFor(employee);
  const diff = auditDiff(auditable(existing), auditable({ ...day, date }));
  if (diff) {
    await recordAudit(
      ctx,
      {
        action: "UPDATE",
        module: MODULE,
        entityType: "AttendanceDay",
        entityId: existing.id,
        ...diff,
        message: describe(employee, date, day.status),
      },
      tx,
    );
  }
}

/**
 * Alta o corrección de un día. `employeeId` viene de la URL o, desde el
 * listado general, del formulario. Si el día ya está cargado, solo se
 * modifica desde el registro existente (con su versión).
 */
export async function saveDay(ctx: ActorContext, employeeId: string | null, input: unknown) {
  await assertPermission(ctx, "attendance:write", MODULE);
  const targetId = employeeId ?? attendanceEmployeeSchema.parse(input).employeeId;
  const data = attendanceDaySchema.parse(input);
  const { version } = attendanceVersionSchema.parse(input);
  const date = parseIsoDate(data.date)!;
  assertNotFuture(date, "date");
  const employee = await repo.findEmployee(targetId);
  if (!employee) throw new NotFoundError("El legajo no existe.");

  return repo.transaction(async (tx) => {
    const existing = await repo.findDay(employee.id, date, tx);
    if (existing && !version) {
      throw new ConflictError("Ese día ya tiene asistencia cargada: modificala desde la lista.", {
        date: ["Ya hay asistencia cargada ese día."],
      });
    }
    const context = await loadContext([employee.id], date, date, tx);
    const errors: FieldErrors = {};
    const day = evaluateDay(employee, date, data, context, errors);
    if (!day) throw new ValidationError(undefined, errors);
    await persist(ctx, employee, date, day, version, tx);
    return { status: ATTENDANCE_STATUS_LABELS[day.status] };
  });
}

/** Cálculo previo mientras se completa el formulario de un día. No escribe nada. */
export async function previewDay(ctx: ActorContext, employeeId: string, input: unknown) {
  await assertPermission(ctx, "attendance:write", MODULE);
  const parsed = attendanceDaySchema.safeParse(input);
  if (!parsed.success) return null;
  const date = parseIsoDate(parsed.data.date)!;
  const employee = await repo.findEmployee(employeeId);
  if (!employee) throw new NotFoundError("El legajo no existe.");
  const context = await loadContext([employee.id], date, date);
  const errors: FieldErrors = {};
  const day = evaluateDay(employee, date, parsed.data, context, errors);
  const plan = planLabel(planOf(employee, date, context));
  if (date > todayInTimeZone()) errors.date = ["No se puede cargar asistencia de días futuros."];
  return {
    plan,
    status: day ? ATTENDANCE_STATUS_LABELS[day.status] : null,
    worked: day?.checkIn ? formatMinutes(day.workedMinutes) : null,
    regular: day?.checkIn ? formatMinutes(day.regularMinutes) : null,
    extra: day?.checkIn ? formatMinutes(day.extraMinutes) : null,
    late: day?.lateMinutes ?? 0,
    problems: Object.values(errors).flat(),
  };
}

/**
 * Guarda la planilla de un día: solo las filas que cambiaron. Si una fila
 * tiene problemas no se guarda ninguna, y el error queda marcado en la fila.
 */
export async function saveSheet(ctx: ActorContext, input: unknown) {
  await assertPermission(ctx, "attendance:write", MODULE);
  const data = attendanceSheetSchema.parse(input);
  const date = parseIsoDate(data.date)!;
  assertNotFuture(date, "date");
  const employees = new Map((await repo.employeesByIds(data.rows.map((r) => r.employeeId))).map((e) => [e.id, e]));

  return repo.transaction(async (tx) => {
    const context = await loadContext([...employees.keys()], date, date, tx);
    const errors: FieldErrors = {};
    const evaluated = data.rows.map((row, index) => {
      const employee = employees.get(row.employeeId);
      if (!employee) {
        errors[`rows.${index}.checkIn`] = ["El legajo no existe."];
        return null;
      }
      const day = evaluateDay(employee, date, row, context, errors, `rows.${index}.`);
      return day ? { employee, day, version: row.version } : null;
    });
    if (Object.keys(errors).length > 0) {
      throw new ValidationError("Hay filas con problemas: corregilas y volvé a guardar.", errors);
    }
    for (const item of evaluated) await persist(ctx, item!.employee, date, item!.day, item!.version, tx);
    return { saved: evaluated.length };
  });
}

/* ----------------------------------------------------------------------------
 * Relación con licencias (las llama el servicio de licencias, en su transacción)
 * ------------------------------------------------------------------------- */

/**
 * Un día con fichada no puede quedar cubierto por una licencia aprobada:
 * se corrige primero la asistencia o el período.
 */
export async function assertNoPresence(employeeId: string, start: Date, end: Date, tx: Prisma.TransactionClient) {
  const days = await repo.presenceBetween(employeeId, start, end, tx);
  if (days.length === 0) return;
  const list = days.slice(0, 3).map((d) => formatDate(d.date));
  const more = days.length > 3 ? ` y ${days.length - 3} más` : "";
  throw new ConflictError(
    `El empleado tiene asistencia con fichada el ${list.join(", ")}${more}. Corregí la asistencia o el período antes de aprobar.`,
  );
}

/**
 * Después de aprobar, modificar o anular una licencia: los días ya cargados
 * sin fichada del período pasan a "con licencia" o vuelven a su estado
 * (ausente, franco o feriado). Las horas no cambian.
 */
export async function syncWithLeaves(employeeId: string, start: Date, end: Date, tx: Prisma.TransactionClient) {
  const days = await repo.daysWithoutTimesBetween(employeeId, start, end, tx);
  if (days.length === 0) return;
  const employee = await repo.findEmployee(employeeId, tx);
  if (!employee) return;
  const context = await loadContext([employeeId], start, end, tx);
  for (const day of days) {
    const leave = leaveOn(employeeId, day.date, context);
    const status = attendanceStatus(planOf(employee, day.date, context), false, !!leave);
    const leaveRecordId = leave?.id ?? null;
    if (status !== day.status || leaveRecordId !== day.leaveRecordId) {
      await repo.updateDay(day.id, { status, leaveRecordId }, tx);
    }
  }
}

/** Rango que cubre dos períodos (el anterior y el nuevo de una licencia modificada). */
export function spanOf(...ranges: { start: Date; end: Date }[]) {
  return {
    start: new Date(Math.min(...ranges.map((r) => r.start.getTime()))),
    end: new Date(Math.max(...ranges.map((r) => r.end.getTime()))),
  };
}

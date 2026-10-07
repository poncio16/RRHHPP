import "server-only";
import { countDays } from "@/features/leaves/days";
import { LEAVE_CLASS_LABELS } from "@/features/leaves/constants";
import { holidaysBetween } from "@/features/leaves/repository";
import { workDaysOf } from "@/features/leaves/service";
import { formatMinutes } from "@/features/attendance/calc";
import type { ConceptNature } from "@/features/salaries/constants";
import {
  formatDate,
  formatMoney,
  formatPeriod,
  parseIsoDate,
  parsePeriod,
  periodEnd,
  periodKey,
  periodOf,
  addMonths,
  todayInTimeZone,
  toIsoDate,
} from "@/lib/format";
import { paginate } from "@/lib/list/query";
import { decimalInput, sumAmounts } from "@/lib/validators/decimal";
import { auditDiff, recordAudit } from "@/server/audit";
import { assertPermission, hasPermission } from "@/server/authz";
import type { ActorContext } from "@/server/context";
import { ConflictError, NotFoundError, ValidationError, type FieldErrors } from "@/server/errors";
import { getSetting } from "@/server/settings";
import { isNoveltySource, NOVELTY_SOURCE_LABELS, NOVELTY_STATUS_LABELS, type NoveltyStatus } from "./constants";
import { minutesToHours, planGeneration, type DesiredNovelty, type GeneratedNovelty } from "./generation";
import * as repo from "./repository";
import {
  annulNoveltySchema,
  bulkNoveltySchema,
  generationSchema,
  noveltyEmployeeSchema,
  noveltyListQuerySchema,
  noveltySchema,
  type NoveltyInput,
} from "./schemas";

const MODULE = "novedades";

const fullName = (e: { lastName: string; firstName: string }) => `${e.lastName}, ${e.firstName}`;
const fixed = (value: { toString(): string } | null) => (value === null ? null : Number(value.toString()).toFixed(2));
const dayMonth = (date: Date) => formatDate(date).slice(0, 5);

/* ----------------------------------------------------------------------------
 * Vistas
 * ------------------------------------------------------------------------- */

function toItem(ctx: ActorContext, row: repo.NoveltyRow) {
  const source = isNoveltySource(row.sourceType) ? row.sourceType : null;
  // Un cambio de básico generado es un dato salarial: sin ese permiso no se muestra el importe.
  const hidden = source === "SALARY_HISTORY" && !hasPermission(ctx, "salary:read");
  const quantity = row.quantity === null ? null : Number(row.quantity.toString());
  return {
    id: row.id,
    employee: row.employee,
    type: { id: row.noveltyType.id, name: row.noveltyType.name, nature: row.noveltyType.nature as ConceptNature },
    date: row.date,
    period: row.period,
    quantity,
    quantityUnit: row.noveltyType.quantityUnit,
    amount: hidden ? null : fixed(row.amount),
    status: row.status as NoveltyStatus,
    source: source ? NOVELTY_SOURCE_LABELS[source] : null,
    notes: hidden ? "Dato salarial reservado." : row.notes,
    createdBy: row.createdBy.name,
    createdAt: row.createdAt,
    version: row.updatedAt.toISOString(),
    editable: !source && (row.status === "PENDIENTE" || row.status === "APROBADA"),
    formValues: {
      noveltyTypeId: row.noveltyTypeId,
      date: toIsoDate(row.date),
      period: periodKey(row.period),
      quantity: row.quantity === null ? "" : decimalInput(row.quantity).replace(/,00$/, ""),
      amount: row.amount === null ? "" : decimalInput(row.amount),
      notes: row.notes ?? "",
    },
  };
}

export type NoveltyItem = ReturnType<typeof toItem>;

type ListResult = Awaited<ReturnType<typeof repo.listNovelties>>;

function toSummary(result: Pick<ListResult, "byStatus" | "amounts">) {
  const count = (status: NoveltyStatus) => result.byStatus.find((s) => s.status === status)?.count ?? 0;
  const sum = (nature: ConceptNature) =>
    sumAmounts(result.amounts.filter((a) => a.nature === nature).map((a) => a.amount));
  return {
    pending: count("PENDIENTE"),
    approved: count("APROBADA"),
    reported: count("INFORMADA"),
    annulled: count("ANULADA"),
    haberes: sum("HABER"),
    descuentos: sum("DESCUENTO"),
  };
}

export type NoveltySummary = ReturnType<typeof toSummary>;

/**
 * Novedades de un período (por defecto, el mes en curso), con los contadores
 * por estado y los importes del filtro.
 */
export async function listNovelties(ctx: ActorContext, rawQuery: unknown) {
  await assertPermission(ctx, "novelty:read", MODULE);
  const parsed = noveltyListQuerySchema.parse(rawQuery);
  const current = periodOf(todayInTimeZone());
  const period = parsed.periodo ? parsePeriod(parsed.periodo)! : current;
  const query = { ...parsed, periodo: periodKey(period) };
  const result = await repo.listNovelties(query);
  return {
    ...paginate(
      result.items.map((row) => toItem(ctx, row)),
      result.total,
      query.page,
      query.pageSize,
    ),
    summary: toSummary(result),
    period,
    label: formatPeriod(period),
    prev: periodKey(addMonths(period, -1)),
    next: periodKey(addMonths(period, 1)),
    /** Se generan novedades hasta el mes en curso. */
    canGenerate: period <= current,
    query,
  };
}

/** Novedades de un legajo, de todos los períodos. */
export async function listEmployeeNovelties(ctx: ActorContext, employeeId: string, rawQuery: unknown) {
  await assertPermission(ctx, "novelty:read", MODULE);
  const query = noveltyListQuerySchema.parse(rawQuery);
  const result = await repo.listNovelties({ ...query, periodo: undefined }, employeeId);
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

export async function getTypeOptions(ctx: ActorContext, includeIds: string[] = []) {
  await assertPermission(ctx, "novelty:read", MODULE);
  const rows = await repo.listTypeOptions(includeIds);
  return rows.map((r) => ({ ...r, nature: r.nature as ConceptNature }));
}

export type NoveltyTypeOption = Awaited<ReturnType<typeof getTypeOptions>>[number];

export async function getEmployeeOptions(ctx: ActorContext) {
  await assertPermission(ctx, "novelty:write", MODULE);
  return repo.listEmployeeOptions();
}

export async function getDepartmentOptions(ctx: ActorContext) {
  await assertPermission(ctx, "novelty:read", MODULE);
  return repo.listDepartments();
}

/* ----------------------------------------------------------------------------
 * Carga manual
 * ------------------------------------------------------------------------- */

/** Valida tipo, importe, cantidad y fechas contra el empleado. */
async function validateManual(
  employee: NonNullable<Awaited<ReturnType<typeof repo.findEmployee>>>,
  data: NoveltyInput,
  currentTypeId: string | null,
) {
  const type = await repo.findType(data.noveltyTypeId);
  const errors: FieldErrors = {};
  if (!type) errors.noveltyTypeId = ["El tipo de novedad no existe."];
  else if (!type.isActive && type.id !== currentTypeId) errors.noveltyTypeId = ["El tipo de novedad está desactivado."];
  if (type?.requiresAmount && data.amount === null) errors.amount = [`${type.name} requiere el importe.`];
  if (type?.requiresQuantity && data.quantity === null) {
    errors.quantity = [`${type.name} requiere la cantidad${type.quantityUnit ? ` (${type.quantityUnit})` : ""}.`];
  }
  const date = parseIsoDate(data.date)!;
  const period = parsePeriod(data.period)!;
  if (date < employee.hireDate) errors.date = [`Es anterior al ingreso (${formatDate(employee.hireDate)}).`];
  else if (employee.exitDate && date > employee.exitDate) {
    errors.date = [`Es posterior al egreso (${formatDate(employee.exitDate)}).`];
  }
  if (period < periodOf(employee.hireDate)) errors.period = ["Es anterior al mes de ingreso."];
  else if (employee.exitDate && period > periodOf(employee.exitDate))
    errors.period = ["Es posterior al mes de egreso."];
  if (Object.keys(errors).length > 0) throw new ValidationError(undefined, errors);
  return { type: type!, date, period };
}

const auditable = (n: {
  noveltyTypeId: string;
  date: Date;
  period: Date;
  quantity: unknown;
  amount: unknown;
  notes: string | null;
  status?: string;
}) => ({
  noveltyTypeId: n.noveltyTypeId,
  date: toIsoDate(n.date),
  period: periodKey(n.period),
  quantity: n.quantity === null ? null : fixed(n.quantity as string),
  amount: n.amount === null ? null : fixed(n.amount as string),
  notes: n.notes,
  ...(n.status ? { status: n.status } : {}),
});

/** Alta manual: nace pendiente de aprobación. */
export async function createNovelty(ctx: ActorContext, employeeId: string | null, input: unknown) {
  await assertPermission(ctx, "novelty:write", MODULE);
  const target = employeeId ?? noveltyEmployeeSchema.parse(input).employeeId;
  const data = noveltySchema.parse(input);
  const employee = await repo.findEmployee(target);
  if (!employee) throw new NotFoundError("El empleado no existe.");
  const { type, date, period } = await validateManual(employee, data, null);

  return repo.transaction(async (tx) => {
    const created = await repo.createNovelty(
      {
        employeeId: target,
        noveltyTypeId: type.id,
        date,
        period,
        quantity: data.quantity,
        amount: data.amount,
        notes: data.notes,
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
        entityType: "Novelty",
        entityId: created.id,
        after: { employeeId: target, ...auditable(created), status: created.status },
        message: `Novedad ${type.name} de ${fullName(employee)}, ${formatPeriod(period)}`,
      },
      tx,
    );
    return { id: created.id };
  });
}

/** Modifica una novedad manual pendiente o aprobada; si estaba aprobada vuelve a pendiente. */
export async function updateNovelty(ctx: ActorContext, id: string, input: unknown) {
  await assertPermission(ctx, "novelty:write", MODULE);
  const data = noveltySchema.parse(input);
  const current = await repo.findNovelty(id);
  if (!current) throw new NotFoundError();
  if (current.sourceType) {
    throw new ConflictError("Las novedades generadas no se modifican: se recalculan al volver a generar el período.");
  }
  if (current.status !== "PENDIENTE" && current.status !== "APROBADA") {
    throw new ConflictError(
      `Una novedad ${NOVELTY_STATUS_LABELS[current.status].toLowerCase()} no se puede modificar.`,
    );
  }
  const employee = (await repo.findEmployee(current.employeeId))!;
  const { type, date, period } = await validateManual(employee, data, current.noveltyTypeId);
  const next = {
    noveltyTypeId: type.id,
    date,
    period,
    quantity: data.quantity,
    amount: data.amount,
    notes: data.notes,
  };
  const diff = auditDiff(auditable(current), auditable(next));
  if (!diff) return { status: NOVELTY_STATUS_LABELS[current.status as NoveltyStatus] };

  await repo.transaction(async (tx) => {
    const ok = await repo.updateGuarded(
      id,
      { statuses: ["PENDIENTE", "APROBADA"], version: data.version ? new Date(data.version) : current.updatedAt },
      { ...next, status: "PENDIENTE", updatedById: ctx.userId },
      tx,
    );
    if (!ok)
      throw new ConflictError("Otra persona modificó esta novedad mientras editabas. Volvé a abrir el formulario.");
    await recordAudit(
      ctx,
      {
        action: "UPDATE",
        module: MODULE,
        entityType: "Novelty",
        entityId: id,
        before: { ...diff.before, status: current.status },
        after: { ...diff.after, status: "PENDIENTE" },
        message: `Modificación de la novedad ${type.name} de ${fullName(employee)}`,
      },
      tx,
    );
  });
  return { status: NOVELTY_STATUS_LABELS.PENDIENTE };
}

/* ----------------------------------------------------------------------------
 * Estados
 * ------------------------------------------------------------------------- */

type Transition = { from: NoveltyStatus; to: NoveltyStatus; verb: string };

const TRANSITIONS = {
  aprobar: { from: "PENDIENTE", to: "APROBADA", verb: "Aprobación" },
  informar: { from: "APROBADA", to: "INFORMADA", verb: "Novedad informada" },
  revertir: { from: "INFORMADA", to: "APROBADA", verb: "Novedad desmarcada como informada" },
} as const satisfies Record<string, Transition>;

async function changeStatus(ctx: ActorContext, id: string, transition: Transition) {
  const current = await repo.findNovelty(id);
  if (!current) throw new NotFoundError();
  if (current.status !== transition.from) {
    throw new ConflictError(
      `La novedad está ${NOVELTY_STATUS_LABELS[current.status as NoveltyStatus].toLowerCase()}: actualizá la página.`,
    );
  }
  await repo.transaction(async (tx) => {
    const ok = await repo.updateGuarded(
      id,
      { statuses: [transition.from] },
      { status: transition.to, updatedById: ctx.userId },
      tx,
    );
    if (!ok) throw new ConflictError("Otra persona cambió el estado de esta novedad. Actualizá la página.");
    await recordAudit(
      ctx,
      {
        action: "UPDATE",
        module: MODULE,
        entityType: "Novelty",
        entityId: id,
        before: { status: transition.from },
        after: { status: transition.to },
        message: `${transition.verb}: ${current.noveltyType.name} de ${fullName(current.employee)}, ${formatPeriod(current.period)}`,
      },
      tx,
    );
  });
  return { status: NOVELTY_STATUS_LABELS[transition.to] };
}

export async function approveNovelty(ctx: ActorContext, id: string) {
  await assertPermission(ctx, "novelty:write", MODULE);
  return changeStatus(ctx, id, TRANSITIONS.aprobar);
}

/** Marca como informada al sistema de liquidación una novedad aprobada. */
export async function reportNovelty(ctx: ActorContext, id: string) {
  await assertPermission(ctx, "novelty:report", MODULE);
  return changeStatus(ctx, id, TRANSITIONS.informar);
}

/** Vuelve a aprobada una novedad marcada como informada por error. */
export async function unreportNovelty(ctx: ActorContext, id: string) {
  await assertPermission(ctx, "novelty:report", MODULE);
  return changeStatus(ctx, id, TRANSITIONS.revertir);
}

/** Anula una novedad pendiente o aprobada; el motivo queda en las observaciones. */
export async function annulNovelty(ctx: ActorContext, id: string, input: unknown) {
  await assertPermission(ctx, "novelty:write", MODULE);
  const { reason, version } = annulNoveltySchema.parse(input);
  const current = await repo.findNovelty(id);
  if (!current) throw new NotFoundError();
  if (current.status !== "PENDIENTE" && current.status !== "APROBADA") {
    throw new ConflictError(
      current.status === "INFORMADA"
        ? "Ya se informó al sistema de liquidación: desmarcala como informada antes de anularla."
        : "La novedad ya está anulada.",
    );
  }
  const notes = [current.notes, `Anulada: ${reason}`].filter(Boolean).join("\n").slice(0, 1000);
  await repo.transaction(async (tx) => {
    const ok = await repo.updateGuarded(
      id,
      { statuses: ["PENDIENTE", "APROBADA"], version: version ? new Date(version) : undefined },
      { status: "ANULADA", notes, updatedById: ctx.userId },
      tx,
    );
    if (!ok) throw new ConflictError("Otra persona modificó esta novedad. Actualizá la página.");
    await recordAudit(
      ctx,
      {
        action: "UPDATE",
        module: MODULE,
        entityType: "Novelty",
        entityId: id,
        before: { status: current.status },
        after: { status: "ANULADA", reason },
        message: `Anulación de la novedad ${current.noveltyType.name} de ${fullName(current.employee)}`,
      },
      tx,
    );
  });
  return { status: NOVELTY_STATUS_LABELS.ANULADA };
}

/**
 * Aprueba las pendientes o marca como informadas las aprobadas de todo el
 * filtro (un período). Devuelve cuántas cambiaron.
 */
export async function bulkUpdate(ctx: ActorContext, input: unknown) {
  const data = bulkNoveltySchema.parse(input);
  const transition = data.action === "aprobar" ? TRANSITIONS.aprobar : TRANSITIONS.informar;
  await assertPermission(ctx, data.action === "aprobar" ? "novelty:write" : "novelty:report", MODULE);
  // El estado lo fija la operación: el filtro de estado de la pantalla no se aplica.
  const where = await repo.noveltyWhere({ ...data, estado: "todas" });
  return repo.transaction(async (tx) => {
    const ids = await repo.idsForBulk({ AND: [where, { status: transition.from }] }, tx);
    if (ids.length === 0) return { changed: 0 };
    const changed = await repo.updateManyStatus(
      ids,
      transition.from,
      { status: transition.to, updatedById: ctx.userId },
      tx,
    );
    for (const id of ids) {
      await recordAudit(
        ctx,
        {
          action: "UPDATE",
          module: MODULE,
          entityType: "Novelty",
          entityId: id,
          before: { status: transition.from },
          after: { status: transition.to },
          message: `${transition.verb} en lote (${formatPeriod(parsePeriod(data.periodo)!)})`,
        },
        tx,
      );
    }
    return { changed };
  });
}

/* ----------------------------------------------------------------------------
 * Generación desde otros módulos
 * ------------------------------------------------------------------------- */

/** Novedades que corresponden al período según licencias, asistencia, básicos y categorías. */
async function desiredFor(period: Date) {
  const start = period;
  const end = periodEnd(period);
  const [origins, leaves, attendance, salaries, categories, { defaultWorkDays: workDayCount }, holidays] =
    await Promise.all([
      repo.typesByOrigin(),
      repo.leavesForPeriod(start, end),
      repo.attendanceForPeriod(start, end),
      repo.salaryChangesForPeriod(start, end),
      repo.categoryChangesForPeriod(start, end),
      getSetting("leaves"),
      holidaysBetween(start, end),
    ]);
  const desired: DesiredNovelty[] = [];

  for (const leave of leaves) {
    const from = leave.startDate > start ? leave.startDate : start;
    const to = leave.endDate < end ? leave.endDate : end;
    const days = countDays(
      from,
      to,
      leave.leaveType.countingMode,
      workDaysOf(leave.employee, workDayCount),
      leave.leaveType.countingMode === "HABILES" ? holidays : new Set(),
    );
    if (days === 0) continue;
    const label = LEAVE_CLASS_LABELS[leave.leaveType.class];
    desired.push({
      sourceType: "LEAVE",
      sourceId: leave.id,
      employeeId: leave.employeeId,
      noveltyTypeId: leave.leaveType.generatesNoveltyTypeId!,
      date: from,
      quantity: days.toFixed(2),
      amount: null,
      notes: `${label} del ${formatDate(leave.startDate)} al ${formatDate(leave.endDate)}: ${days} ${days === 1 ? "día" : "días"} en ${formatPeriod(period)}.`,
    });
  }

  const byEmployee = new Map<string, typeof attendance>();
  for (const day of attendance) byEmployee.set(day.employeeId, [...(byEmployee.get(day.employeeId) ?? []), day]);
  const extraType = origins.get("HORAS_EXTRAS");
  const lateType = origins.get("LLEGADAS_TARDE");
  const absenceType = origins.get("AUSENCIAS");
  for (const [employeeId, days] of byEmployee) {
    const extra = days.filter((d) => d.extraMinutes > 0);
    if (extraType && extra.length > 0) {
      const minutes = extra.reduce((acc, d) => acc + d.extraMinutes, 0);
      desired.push({
        sourceType: "ATTENDANCE_EXTRA",
        sourceId: employeeId,
        employeeId,
        noveltyTypeId: extraType.id,
        date: extra.at(-1)!.date,
        quantity: minutesToHours(minutes),
        amount: null,
        notes: `${formatMinutes(minutes)} h adicionales en ${extra.length} ${extra.length === 1 ? "día" : "días"}: ${extra.map((d) => dayMonth(d.date)).join(", ")}.`,
      });
    }
    const late = days.filter((d) => d.lateMinutes > 0);
    if (lateType && late.length > 0) {
      const minutes = late.reduce((acc, d) => acc + d.lateMinutes, 0);
      desired.push({
        sourceType: "ATTENDANCE_LATE",
        sourceId: employeeId,
        employeeId,
        noveltyTypeId: lateType.id,
        date: late.at(-1)!.date,
        quantity: late.length.toFixed(2),
        amount: null,
        notes: `${late.length} ${late.length === 1 ? "llegada tarde" : "llegadas tarde"}, ${minutes} min en total: ${late.map((d) => dayMonth(d.date)).join(", ")}.`,
      });
    }
    const absent = days.filter((d) => d.status === "AUSENTE");
    if (absenceType && absent.length > 0) {
      desired.push({
        sourceType: "ATTENDANCE_ABSENCE",
        sourceId: employeeId,
        employeeId,
        noveltyTypeId: absenceType.id,
        date: absent.at(-1)!.date,
        quantity: absent.length.toFixed(2),
        amount: null,
        notes: `Ausente sin licencia: ${absent.map((d) => dayMonth(d.date)).join(", ")}.`,
      });
    }
  }

  const salaryType = origins.get("CAMBIO_SALARIAL");
  if (salaryType) {
    // El primer básico de un empleado es el de ingreso, no un cambio.
    for (const change of salaries.filter((s) => s.previous)) {
      desired.push({
        sourceType: "SALARY_HISTORY",
        sourceId: change.id,
        employeeId: change.employeeId,
        noveltyTypeId: salaryType.id,
        date: change.effectiveDate,
        quantity: null,
        amount: fixed(change.basicSalary),
        notes: `Básico de ${formatMoney(change.basicSalary)} desde el ${formatDate(change.effectiveDate)} (anterior ${formatMoney(change.previous!.basicSalary)}).`,
      });
    }
  }

  const categoryType = origins.get("CAMBIO_CATEGORIA");
  if (categoryType) {
    const seen = new Set<string>();
    for (const change of categories) {
      if (seen.has(change.changeSetId)) continue;
      seen.add(change.changeSetId);
      desired.push({
        sourceType: "CATEGORY_CHANGE",
        sourceId: change.changeSetId,
        employeeId: change.employeeId,
        noveltyTypeId: categoryType.id,
        date: change.effectiveDate,
        quantity: null,
        amount: null,
        notes: `Categoría: ${change.oldValue ?? "sin categoría"} → ${change.newValue ?? "sin categoría"}, desde el ${formatDate(change.effectiveDate)}.`,
      });
    }
  }

  const unconfigured = (
    ["HORAS_EXTRAS", "LLEGADAS_TARDE", "AUSENCIAS", "CAMBIO_SALARIAL", "CAMBIO_CATEGORIA"] as const
  ).filter((origin) => !origins.has(origin));
  return { desired, unconfigured };
}

function assertGenerable(period: Date) {
  if (period > periodOf(todayInTimeZone())) {
    throw new ValidationError(undefined, { period: ["Solo se generan novedades hasta el mes en curso."] });
  }
}

async function buildPlan(period: Date) {
  const [{ desired, unconfigured }, existing] = await Promise.all([desiredFor(period), repo.generatedInPeriod(period)]);
  const plan = planGeneration(
    desired,
    existing.map((n): GeneratedNovelty => ({
      id: n.id,
      status: n.status,
      sourceType: n.sourceType!,
      sourceId: n.sourceId!,
      employeeId: n.employeeId,
      noveltyTypeId: n.noveltyTypeId,
      date: n.date,
      quantity: fixed(n.quantity),
      amount: fixed(n.amount),
      notes: n.notes ?? "",
    })),
  );
  return { plan, unconfigured };
}

/** Vista previa de la generación: qué se crea, actualiza o anula, sin guardar nada. */
export async function previewGeneration(ctx: ActorContext, input: unknown) {
  await assertPermission(ctx, "novelty:write", MODULE);
  const period = parsePeriod(generationSchema.parse(input).period)!;
  assertGenerable(period);
  const { plan, unconfigured } = await buildPlan(period);
  const all = [
    ...plan.create,
    ...plan.update.flatMap((u) => [u.current, u.next]),
    ...plan.annul,
    ...plan.informedChanged.map((c) => c.current),
  ];
  const [names, types] = await Promise.all([
    repo.employeeNames([...new Set(all.map((n) => n.employeeId))]),
    repo.typeNames([...new Set(all.map((n) => n.noveltyTypeId))]),
  ]);
  const describe = (n: DesiredNovelty) => {
    const employee = names.get(n.employeeId);
    return {
      key: `${n.sourceType}|${n.sourceId}`,
      employee: employee ? `${fullName(employee)} (${employee.fileNumber})` : "—",
      type: types.get(n.noveltyTypeId) ?? "—",
      notes:
        n.sourceType === "SALARY_HISTORY" && !hasPermission(ctx, "salary:read") ? "Dato salarial reservado." : n.notes,
    };
  };
  return {
    period: periodKey(period),
    label: formatPeriod(period),
    create: plan.create.map(describe),
    update: plan.update.map((u) => describe(u.next)),
    annul: plan.annul.map(describe),
    informedChanged: plan.informedChanged.map((c) => ({ ...describe(c.current), gone: c.next === null })),
    unchanged: plan.unchanged,
    skippedAnnulled: plan.skippedAnnulled,
    unconfigured,
  };
}

export type GenerationPreview = Awaited<ReturnType<typeof previewGeneration>>;

/**
 * Genera las novedades del período. Es idempotente: crea las que faltan,
 * actualiza las pendientes o aprobadas que cambiaron (vuelven a pendiente) y
 * anula las que ya no corresponden. Las informadas y las anuladas no se tocan.
 */
export async function generateNovelties(ctx: ActorContext, input: unknown) {
  await assertPermission(ctx, "novelty:write", MODULE);
  const period = parsePeriod(generationSchema.parse(input).period)!;
  assertGenerable(period);
  const { plan } = await buildPlan(period);
  const label = formatPeriod(period);

  await repo.transaction(async (tx) => {
    for (const next of plan.create) {
      const created = await repo.createNovelty(
        { ...next, period, createdById: ctx.userId, updatedById: ctx.userId },
        tx,
      );
      await recordAudit(
        ctx,
        {
          action: "CREATE",
          module: MODULE,
          entityType: "Novelty",
          entityId: created.id,
          after: {
            employeeId: next.employeeId,
            sourceType: next.sourceType,
            sourceId: next.sourceId,
            ...auditable({ ...next, period }),
          },
          message: `Novedad generada: ${created.noveltyType.name} de ${fullName(created.employee)}, ${label}`,
        },
        tx,
      );
    }
    for (const { current, next } of plan.update) {
      const ok = await repo.updateGuarded(
        current.id,
        { statuses: ["PENDIENTE", "APROBADA"] },
        {
          noveltyTypeId: next.noveltyTypeId,
          date: next.date,
          quantity: next.quantity,
          amount: next.amount,
          notes: next.notes,
          status: "PENDIENTE",
          updatedById: ctx.userId,
        },
        tx,
      );
      if (!ok)
        throw new ConflictError("Otra persona cambió novedades del período mientras se generaban. Volvé a intentar.");
      await recordAudit(
        ctx,
        {
          action: "UPDATE",
          module: MODULE,
          entityType: "Novelty",
          entityId: current.id,
          before: { ...auditable({ ...current, period }), status: current.status },
          after: { ...auditable({ ...next, period }), status: "PENDIENTE" },
          message: `Novedad recalculada al generar ${label}`,
        },
        tx,
      );
    }
    for (const current of plan.annul) {
      const ok = await repo.updateGuarded(
        current.id,
        { statuses: ["PENDIENTE", "APROBADA"] },
        {
          status: "ANULADA",
          notes: [current.notes, "Anulada al generar: el registro de origen ya no corresponde."]
            .filter(Boolean)
            .join("\n"),
          updatedById: ctx.userId,
        },
        tx,
      );
      if (!ok)
        throw new ConflictError("Otra persona cambió novedades del período mientras se generaban. Volvé a intentar.");
      await recordAudit(
        ctx,
        {
          action: "UPDATE",
          module: MODULE,
          entityType: "Novelty",
          entityId: current.id,
          before: { status: current.status },
          after: { status: "ANULADA" },
          message: `Novedad anulada al generar ${label}: el origen ya no corresponde`,
        },
        tx,
      );
    }
  });
  return {
    created: plan.create.length,
    updated: plan.update.length,
    annulled: plan.annul.length,
    informedChanged: plan.informedChanged.length,
  };
}

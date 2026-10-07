import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { formatDate, parseIsoDate, periodOf, todayInTimeZone, toIsoDate } from "@/lib/format";
import { paginate } from "@/lib/list/query";
import { recordAudit } from "@/server/audit";
import { assertPermission } from "@/server/authz";
import type { ActorContext } from "@/server/context";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { EXIT_REASON_GROUP, EXIT_STATUS_LABELS, EXIT_TYPE_GROUP } from "./constants";
import * as repo from "./repository";
import {
  annulExitSchema,
  confirmExitSchema,
  exitEmployeeSchema,
  exitListQuerySchema,
  exitSchema,
  rehireSchema,
  type ExitInput,
} from "./schemas";

const MODULE = "egresos";

const fullName = (e: { lastName: string; firstName: string }) => `${e.lastName}, ${e.firstName}`;
const sameDay = (a: Date | null, b: Date | null) => !!a && !!b && a.getTime() === b.getTime();

/* ----------------------------------------------------------------------------
 * Vistas
 * ------------------------------------------------------------------------- */

function toItem(row: repo.ExitRow) {
  // Un egreso confirmado se puede anular mientras sea el que dejó egresado al empleado.
  const current =
    row.status === "CONFIRMADO" && row.employee.status === "EGRESADO" && sameDay(row.employee.exitDate, row.exitDate);
  return {
    id: row.id,
    employee: {
      id: row.employee.id,
      fileNumber: row.employee.fileNumber,
      lastName: row.employee.lastName,
      firstName: row.employee.firstName,
    },
    exitDate: row.exitDate,
    type: row.exitType,
    reason: row.exitReason,
    status: row.status,
    notes: row.notes,
    confirmedBy: row.confirmedBy?.name ?? null,
    confirmedAt: row.confirmedAt,
    documents: row._count.documents,
    version: row.updatedAt.toISOString(),
    editable: row.status === "EN_TRAMITE" || current,
    annullable: row.status === "EN_TRAMITE" || current,
    formValues: {
      exitDate: toIsoDate(row.exitDate),
      exitTypeId: row.exitType.id,
      exitReasonId: row.exitReason.id,
      notes: row.notes ?? "",
    },
  };
}
export type ExitItem = ReturnType<typeof toItem>;

export async function listExits(ctx: ActorContext, rawQuery: unknown) {
  await assertPermission(ctx, "exit:read", MODULE);
  const query = exitListQuerySchema.parse(rawQuery);
  const { items, total, byStatus } = await repo.listExits(query);
  return {
    query,
    ...paginate(items.map(toItem), total, query.page, query.pageSize),
    summary: {
      pending: byStatus.EN_TRAMITE ?? 0,
      confirmed: byStatus.CONFIRMADO ?? 0,
      annulled: byStatus.ANULADO ?? 0,
    },
  };
}

export async function listEmployeeExits(ctx: ActorContext, employeeId: string) {
  await assertPermission(ctx, "exit:read", MODULE);
  return (await repo.listEmployeeExits(employeeId)).map(toItem);
}

/** Egreso en trámite del empleado, para destacarlo en el legajo. */
export async function getPendingExit(ctx: ActorContext, employeeId: string) {
  await assertPermission(ctx, "exit:read", MODULE);
  const row = await repo.findPendingExit(employeeId);
  return row ? { id: row.id, exitDate: row.exitDate } : null;
}

export type ExitOption = { id: string; label: string; isActive: boolean };

/** Tipos y motivos activos más los ya usados en los egresos que se muestran. */
export async function getExitOptions(ctx: ActorContext, includeIds: string[] = []) {
  await assertPermission(ctx, "exit:read", MODULE);
  const [types, reasons] = await Promise.all([
    repo.lookupOptions(EXIT_TYPE_GROUP, includeIds),
    repo.lookupOptions(EXIT_REASON_GROUP, includeIds),
  ]);
  return { types, reasons };
}

export async function getEmployeeOptions(ctx: ActorContext) {
  await assertPermission(ctx, "exit:write", MODULE);
  return repo.listEmployeeOptions();
}

/* ----------------------------------------------------------------------------
 * Validaciones
 * ------------------------------------------------------------------------- */

async function validateExit(
  data: ExitInput,
  employee: repo.ExitEmployee,
  current: { exitTypeId: string; exitReasonId: string } | null,
  tx: Prisma.TransactionClient,
) {
  const errors: Record<string, string[]> = {};
  const date = parseIsoDate(data.exitDate)!;
  if (date < employee.hireDate) {
    errors.exitDate = [`No puede ser anterior al ingreso (${formatDate(employee.hireDate)}).`];
  }
  const [type, reason] = await Promise.all([
    repo.findLookup(data.exitTypeId, EXIT_TYPE_GROUP, tx),
    repo.findLookup(data.exitReasonId, EXIT_REASON_GROUP, tx),
  ]);
  // Uno inactivo se acepta solo si ya era el del egreso que se modifica.
  if (!type || (!type.isActive && type.id !== current?.exitTypeId))
    errors.exitTypeId = ["Elegí un tipo de egreso activo."];
  if (!reason || (!reason.isActive && reason.id !== current?.exitReasonId))
    errors.exitReasonId = ["Elegí un motivo activo."];
  if (Object.keys(errors).length) throw new ValidationError(undefined, errors);
  return { date, type: type!, reason: reason! };
}

const plural = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

/**
 * Pasa al empleado a egresado. Exige fecha no futura y que no quede nada
 * cargado después del egreso (licencias, asistencia, básicos, resúmenes ni
 * novedades): eso se corrige antes en su módulo. Devuelve avisos que no bloquean.
 */
async function applyConfirmation(
  ctx: ActorContext,
  exit: { id: string; exitDate: Date; version?: Date; typeLabel: string },
  employee: repo.ExitEmployee,
  tx: Prisma.TransactionClient,
) {
  const today = todayInTimeZone();
  if (exit.exitDate > today) {
    throw new ConflictError(
      `El egreso es del ${formatDate(exit.exitDate)}: se puede confirmar a partir de ese día. Mientras tanto queda en trámite.`,
    );
  }
  if (employee.status !== "ACTIVO") throw new ConflictError("El empleado ya figura como egresado.");

  const after = await repo.recordsAfter(employee.id, exit.exitDate, periodOf(exit.exitDate), tx);
  const pending = [
    after.leaves &&
      plural(after.leaves, "licencia o ausencia que termina", "licencias o ausencias que terminan") + " después",
    after.attendance && plural(after.attendance, "día de asistencia", "días de asistencia"),
    after.salaries && plural(after.salaries, "cambio de básico", "cambios de básico"),
    after.payrolls &&
      plural(after.payrolls, "resumen informado de un mes", "resúmenes informados de meses") + " posteriores",
    after.novelties && plural(after.novelties, "novedad", "novedades"),
  ].filter(Boolean);
  if (pending.length) {
    throw new ConflictError(
      `Hay datos cargados después del ${formatDate(exit.exitDate)}: ${pending.join(", ")}. Corregilos o anulalos en su módulo antes de confirmar el egreso.`,
    );
  }

  const ok = await repo.updateGuarded(
    exit.id,
    { statuses: ["EN_TRAMITE"], version: exit.version },
    { status: "CONFIRMADO", confirmedById: ctx.userId, confirmedAt: new Date(), updatedById: ctx.userId },
    tx,
  );
  if (!ok) throw new ConflictError("Otra persona modificó este egreso. Actualizá la página.");
  await tx.employee.update({
    where: { id: employee.id },
    data: { status: "EGRESADO", exitDate: exit.exitDate, updatedById: ctx.userId, version: { increment: 1 } },
  });
  await recordAudit(
    ctx,
    {
      action: "UPDATE",
      module: MODULE,
      entityType: "Employee",
      entityId: employee.id,
      before: { status: employee.status, exitDate: null },
      after: { status: "EGRESADO", exitDate: toIsoDate(exit.exitDate), exitId: exit.id },
      message: `Egreso confirmado de ${fullName(employee)} (legajo ${employee.fileNumber}): ${exit.typeLabel}, ${formatDate(exit.exitDate)}`,
    },
    tx,
  );

  const { subordinates, userEmail } = await repo.exitWarnings(employee.id, tx);
  const warnings: string[] = [];
  if (subordinates) {
    warnings.push(
      `Tiene ${plural(subordinates, "persona activa", "personas activas")} a cargo: asigná otro superior desde sus legajos.`,
    );
  }
  if (userEmail)
    warnings.push(`Tiene un usuario del sistema activo (${userEmail}): desactivalo en Usuarios si corresponde.`);
  return warnings;
}

/* ----------------------------------------------------------------------------
 * Escritura
 * ------------------------------------------------------------------------- */

/** Registra un egreso en trámite o, con `confirm`, ya confirmado. */
export async function createExit(ctx: ActorContext, employeeId: string | null, input: unknown) {
  await assertPermission(ctx, "exit:write", MODULE);
  const targetId = employeeId ?? exitEmployeeSchema.parse(input).employeeId;
  const data = exitSchema.parse(input);

  return repo.transaction(async (tx) => {
    await repo.lockEmployee(targetId, tx);
    const employee = await repo.findEmployee(targetId, tx);
    if (!employee) throw new NotFoundError("El legajo no existe.");
    if (employee.status !== "ACTIVO") throw new ConflictError("El empleado ya está egresado.");
    if (await repo.findPendingExit(targetId, tx)) {
      throw new ConflictError("El empleado ya tiene un egreso en trámite: modificalo o anulalo.");
    }
    const { date, type, reason } = await validateExit(data, employee, null, tx);
    const exit = await repo.createExit(
      {
        employeeId: targetId,
        exitDate: date,
        exitTypeId: type.id,
        exitReasonId: reason.id,
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
        entityType: "EmployeeExit",
        entityId: exit.id,
        after: { employeeId: targetId, exitDate: data.exitDate, exitType: type.label, exitReason: reason.label },
        message: `Egreso en trámite de ${fullName(employee)} (legajo ${employee.fileNumber}): ${type.label}, ${formatDate(date)}`,
      },
      tx,
    );
    const warnings = data.confirm
      ? await applyConfirmation(ctx, { id: exit.id, exitDate: date, typeLabel: type.label }, employee, tx)
      : [];
    return { id: exit.id, confirmed: data.confirm, warnings };
  });
}

/**
 * Modifica un egreso en trámite. Del confirmado vigente se pueden corregir
 * tipo, motivo y observaciones; para cambiar la fecha hay que anularlo.
 */
export async function updateExit(ctx: ActorContext, id: string, input: unknown) {
  await assertPermission(ctx, "exit:write", MODULE);
  const data = exitSchema.parse(input);
  const current = await repo.findExit(id);
  if (!current) throw new NotFoundError("El egreso no existe.");
  const item = toItem(current);
  if (!item.editable) throw new ConflictError("Este egreso ya no se puede modificar.");
  const confirmed = current.status === "CONFIRMADO";
  if (confirmed && data.exitDate !== toIsoDate(current.exitDate)) {
    throw new ValidationError(undefined, {
      exitDate: ["El egreso ya está confirmado: para cambiar la fecha, anulalo y registralo de nuevo."],
    });
  }

  await repo.transaction(async (tx) => {
    await repo.lockEmployee(current.employeeId, tx);
    const employee = await repo.findEmployee(current.employeeId, tx);
    if (!employee) throw new NotFoundError("El legajo no existe.");
    const { date, type, reason } = await validateExit(data, employee, current, tx);
    const ok = await repo.updateGuarded(
      id,
      { statuses: [current.status], version: data.version ? new Date(data.version) : undefined },
      { exitDate: date, exitTypeId: type.id, exitReasonId: reason.id, notes: data.notes, updatedById: ctx.userId },
      tx,
    );
    if (!ok) throw new ConflictError("Otra persona modificó este egreso. Actualizá la página.");
    await recordAudit(
      ctx,
      {
        action: "UPDATE",
        module: MODULE,
        entityType: "EmployeeExit",
        entityId: id,
        before: {
          exitDate: toIsoDate(current.exitDate),
          exitType: current.exitType.label,
          exitReason: current.exitReason.label,
          notes: current.notes,
        },
        after: { exitDate: data.exitDate, exitType: type.label, exitReason: reason.label, notes: data.notes },
        message: `Modificación del egreso de ${fullName(employee)} (legajo ${employee.fileNumber})`,
      },
      tx,
    );
  });
  return { id };
}

export async function confirmExit(ctx: ActorContext, id: string, input: unknown) {
  await assertPermission(ctx, "exit:write", MODULE);
  const { version } = confirmExitSchema.parse(input);
  const current = await repo.findExit(id);
  if (!current) throw new NotFoundError("El egreso no existe.");
  if (current.status !== "EN_TRAMITE") throw new ConflictError("El egreso no está en trámite.");

  const warnings = await repo.transaction(async (tx) => {
    await repo.lockEmployee(current.employeeId, tx);
    const employee = await repo.findEmployee(current.employeeId, tx);
    if (!employee) throw new NotFoundError("El legajo no existe.");
    return applyConfirmation(
      ctx,
      {
        id,
        exitDate: current.exitDate,
        version: version ? new Date(version) : undefined,
        typeLabel: current.exitType.label,
      },
      employee,
      tx,
    );
  });
  return { warnings };
}

/**
 * Anula un egreso. Si estaba confirmado, el empleado vuelve a activo; solo se
 * puede con el último egreso confirmado y si no reingresó después.
 */
export async function annulExit(ctx: ActorContext, id: string, input: unknown) {
  await assertPermission(ctx, "exit:write", MODULE);
  const { reason, version } = annulExitSchema.parse(input);
  const current = await repo.findExit(id);
  if (!current) throw new NotFoundError("El egreso no existe.");
  if (current.status === "ANULADO") throw new ConflictError("El egreso ya está anulado.");

  await repo.transaction(async (tx) => {
    await repo.lockEmployee(current.employeeId, tx);
    const employee = await repo.findEmployee(current.employeeId, tx);
    if (!employee) throw new NotFoundError("El legajo no existe.");
    const confirmed = current.status === "CONFIRMADO";
    if (confirmed) {
      const last = await repo.findLastConfirmed(employee.id, tx);
      if (employee.status !== "EGRESADO" || !sameDay(employee.exitDate, current.exitDate) || last?.id !== id) {
        throw new ConflictError(
          "El empleado reingresó o tiene un egreso posterior: este egreso queda como historial y no se puede anular.",
        );
      }
    }
    const notes = [current.notes, `Anulado: ${reason}`].filter(Boolean).join("\n").slice(0, 1000);
    const ok = await repo.updateGuarded(
      id,
      { statuses: [current.status], version: version ? new Date(version) : undefined },
      { status: "ANULADO", notes, updatedById: ctx.userId },
      tx,
    );
    if (!ok) throw new ConflictError("Otra persona modificó este egreso. Actualizá la página.");
    if (confirmed) {
      await tx.employee.update({
        where: { id: employee.id },
        data: { status: "ACTIVO", exitDate: null, updatedById: ctx.userId, version: { increment: 1 } },
      });
    }
    await recordAudit(
      ctx,
      {
        action: "UPDATE",
        module: MODULE,
        entityType: "EmployeeExit",
        entityId: id,
        before: { status: current.status, ...(confirmed ? { employeeStatus: "EGRESADO" } : {}) },
        after: { status: "ANULADO", reason, ...(confirmed ? { employeeStatus: "ACTIVO" } : {}) },
        message: `Anulación del egreso de ${fullName(employee)} (legajo ${employee.fileNumber})${confirmed ? ": vuelve a activo" : ""}`,
      },
      tx,
    );
  });
  return { status: EXIT_STATUS_LABELS.ANULADO };
}

/**
 * Reingreso sobre el mismo legajo: nuevo ingreso posterior al último egreso
 * y no futuro. El egreso anterior queda como historial y el cambio se
 * registra en el historial laboral.
 */
export async function rehireEmployee(ctx: ActorContext, employeeId: string, input: unknown) {
  await assertPermission(ctx, "exit:write", MODULE);
  const data = rehireSchema.parse(input);
  const hireDate = parseIsoDate(data.hireDate)!;
  const seniorityDate = data.seniorityDate ? parseIsoDate(data.seniorityDate)! : hireDate;
  const contractEndDate = data.contractEndDate ? parseIsoDate(data.contractEndDate)! : null;

  await repo.transaction(async (tx) => {
    await repo.lockEmployee(employeeId, tx);
    const employee = await repo.findEmployee(employeeId, tx);
    if (!employee) throw new NotFoundError("El legajo no existe.");
    if (employee.status !== "EGRESADO" || !employee.exitDate) throw new ConflictError("El empleado está activo.");
    if (employee.version !== data.version) {
      throw new ConflictError("Otra persona modificó este legajo. Actualizá la página.");
    }
    if (hireDate <= employee.exitDate) {
      throw new ValidationError(undefined, {
        hireDate: [`Tiene que ser posterior al último egreso (${formatDate(employee.exitDate)}).`],
      });
    }
    if (hireDate > todayInTimeZone()) {
      throw new ValidationError(undefined, {
        hireDate: ["No puede ser futura: registrá el reingreso a partir de ese día."],
      });
    }

    const ok = await repo.updateEmployeeVersioned(
      employeeId,
      data.version,
      { status: "ACTIVO", hireDate, seniorityDate, contractEndDate, exitDate: null, updatedById: ctx.userId },
      tx,
    );
    if (!ok) throw new ConflictError("Otra persona modificó este legajo. Actualizá la página.");

    const changeSetId = randomUUID();
    const text = (d: Date | null) => (d ? formatDate(d) : null);
    const row = (field: string, before: Date | null, after: Date | null) =>
      ({
        employeeId,
        changeSetId,
        changeType: "REINGRESO",
        field,
        oldValue: text(before),
        newValue: text(after),
        effectiveDate: hireDate,
        notes: data.notes,
        createdById: ctx.userId,
      }) satisfies Prisma.EmployeeChangeHistoryCreateManyInput;
    await repo.insertHistory(
      [
        row("hireDate", employee.hireDate, hireDate),
        ...(sameDay(employee.seniorityDate, seniorityDate)
          ? []
          : [row("seniorityDate", employee.seniorityDate, seniorityDate)]),
        ...(sameDay(employee.contractEndDate, contractEndDate) ||
        (employee.contractEndDate === null && contractEndDate === null)
          ? []
          : [row("contractEndDate", employee.contractEndDate, contractEndDate)]),
      ],
      tx,
    );
    await recordAudit(
      ctx,
      {
        action: "UPDATE",
        module: MODULE,
        entityType: "Employee",
        entityId: employeeId,
        before: {
          status: "EGRESADO",
          hireDate: toIsoDate(employee.hireDate),
          seniorityDate: toIsoDate(employee.seniorityDate),
          exitDate: toIsoDate(employee.exitDate),
        },
        after: {
          status: "ACTIVO",
          hireDate: data.hireDate,
          seniorityDate: toIsoDate(seniorityDate),
          exitDate: null,
        },
        message: `Reingreso de ${fullName(employee)} (legajo ${employee.fileNumber}) el ${formatDate(hireDate)}`,
      },
      tx,
    );
  });
  return { id: employeeId };
}

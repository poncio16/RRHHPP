import "server-only";
import { formatSeniority } from "@/features/employees/calc";
import * as leaves from "@/features/leaves/repository";
import { workDaysOf } from "@/features/leaves/service";
import { formatDate, todayInTimeZone } from "@/lib/format";
import { paginate } from "@/lib/list/query";
import { auditDiff, recordAudit } from "@/server/audit";
import { assertPermission } from "@/server/authz";
import type { ActorContext } from "@/server/context";
import { BusinessRuleError, ConflictError, NotFoundError } from "@/server/errors";
import { getSetting } from "@/server/settings";
import { cutoffDate, ruleRangeLabel, vacationEntitlement } from "./entitlement";
import * as repo from "./repository";
import {
  balanceListQuerySchema,
  balanceSchema,
  balanceVersionSchema,
  generateBalancesSchema,
  vacationRulesSchema,
} from "./schemas";

const MODULE = "vacaciones";

/* ----------------------------------------------------------------------------
 * Reglas (parámetro de Configuración)
 * ------------------------------------------------------------------------- */

function ruleView(rule: { minSeniorityYears: number; maxSeniorityYears: number | null; days: number }) {
  return {
    minSeniorityYears: rule.minSeniorityYears,
    maxSeniorityYears: rule.maxSeniorityYears,
    days: rule.days,
    label: ruleRangeLabel(rule),
  };
}

/** Reglas vigentes, para mostrarlas junto a los saldos. */
export async function getRules(ctx: ActorContext) {
  await assertPermission(ctx, "leave:read", MODULE);
  return (await repo.listRules()).map(ruleView);
}

/** Reglas para editarlas en Configuración. */
export async function getRulesForEdit(ctx: ActorContext) {
  await assertPermission(ctx, "config:manage", "configuracion");
  return (await repo.listRules()).map(ruleView);
}

/**
 * Guarda la tabla completa de reglas. Los períodos ya generados no cambian:
 * se ajustan a mano si hace falta.
 */
export async function saveRules(ctx: ActorContext, input: unknown) {
  await assertPermission(ctx, "config:manage", "configuracion");
  const { rules } = vacationRulesSchema.parse(input);
  const before = (await repo.listRules()).map(ruleView);
  const after = rules.map(ruleView);
  const diff = auditDiff(
    { rules: before.map((r) => `${r.label}: ${r.days}`) },
    { rules: after.map((r) => `${r.label}: ${r.days}`) },
  );
  if (!diff) return;
  await repo.transaction(async (tx) => {
    await repo.replaceRules(rules, ctx.userId, tx);
    await recordAudit(
      ctx,
      {
        action: "UPDATE",
        module: "configuracion",
        entityType: "VacationRule",
        ...diff,
        message: "Reglas de vacaciones por antigüedad",
      },
      tx,
    );
  });
}

/* ----------------------------------------------------------------------------
 * Saldos por período
 * ------------------------------------------------------------------------- */

function toBalanceItem(row: repo.BalanceRow, usage: { used: number; requested: number }) {
  const total = row.entitledDays + row.adjustmentDays + row.carriedOverDays;
  return {
    id: row.id,
    employee: row.employee,
    year: row.year,
    entitledDays: row.entitledDays,
    adjustmentDays: row.adjustmentDays,
    adjustmentReason: row.adjustmentReason,
    carriedOverDays: row.carriedOverDays,
    notes: row.notes,
    total,
    used: usage.used,
    requested: usage.requested,
    /** Pendientes de usar (los solicitados todavía no se descuentan). */
    pending: total - usage.used,
    version: row.updatedAt.toISOString(),
    formValues: {
      adjustmentDays: String(row.adjustmentDays),
      adjustmentReason: row.adjustmentReason ?? "",
      carriedOverDays: String(row.carriedOverDays),
      notes: row.notes ?? "",
    },
  };
}

export type BalanceItem = ReturnType<typeof toBalanceItem>;

async function withUsage(rows: repo.BalanceRow[]) {
  const usage = await leaves.balanceUsage(rows.map((r) => r.id));
  return rows.map((row) => toBalanceItem(row, usage.get(row.id)!));
}

/**
 * Saldos de un año. Utilizados y pendientes se calculan con los registros
 * aprobados, así que el filtro por saldo y la paginación se hacen acá.
 */
export async function listBalances(ctx: ActorContext, rawQuery: unknown) {
  await assertPermission(ctx, "leave:read", MODULE);
  const parsed = balanceListQuerySchema.parse(rawQuery);
  const years = await repo.listBalanceYears();
  const year = parsed.year ?? years[0] ?? todayInTimeZone().getUTCFullYear();
  const query = { ...parsed, year };
  let items = await withUsage(await repo.listBalances({ year, q: query.q }));
  if (query.saldo === "con-saldo") items = items.filter((i) => i.pending > 0);
  if (query.saldo === "sin-saldo") items = items.filter((i) => i.pending <= 0);
  const start = (query.page - 1) * query.pageSize;
  return {
    ...paginate(items.slice(start, start + query.pageSize), items.length, query.page, query.pageSize),
    query,
    years,
  };
}

/** Períodos de un empleado, del más reciente al más antiguo. */
export async function listEmployeeBalances(ctx: ActorContext, employeeId: string) {
  await assertPermission(ctx, "leave:read", MODULE);
  const rows = await repo.listBalances({ employeeId });
  return (await withUsage(rows)).sort((a, b) => b.year - a.year);
}

/**
 * Cálculo de los períodos que faltan generar en `year`, sin escribir nada:
 * los empleados activos sin período ese año, con los días que les
 * corresponden según las reglas y los parámetros.
 */
export async function previewGeneration(ctx: ActorContext, input: unknown) {
  await assertPermission(ctx, "leave:write", MODULE);
  const { year } = generateBalancesSchema.parse(input);
  return computeGeneration(year);
}

async function computeGeneration(year: number) {
  const [rules, settings, { defaultWorkDays }, employees, existing] = await Promise.all([
    repo.listRules(),
    getSetting("vacations"),
    getSetting("leaves"),
    repo.employeesWithoutBalance(year),
    repo.countBalances(year),
  ]);
  if (rules.length === 0) {
    throw new BusinessRuleError(
      "Todavía no hay reglas de vacaciones. Cargalas en Configuración → Vacaciones antes de generar los períodos.",
    );
  }
  const cutoff = cutoffDate(year, settings.cutoffMonth, settings.cutoffDay);
  const periodStart = new Date(Date.UTC(year - 1, cutoff.getUTCMonth(), cutoff.getUTCDate() + 1));
  const holidays = await leaves.holidaysBetween(periodStart, cutoff);

  const items = [];
  let notYet = 0;
  for (const employee of employees) {
    const result = vacationEntitlement({
      year,
      cutoff: { month: settings.cutoffMonth, day: settings.cutoffDay },
      seniorityDate: employee.seniorityDate,
      hireDate: employee.hireDate,
      rules,
      proportionalMinPercent: settings.proportionalMinPercent,
      proportionalWorkedDays: settings.proportionalWorkedDays,
      workDays: workDaysOf(employee, defaultWorkDays),
      holidays,
    });
    if (!result) {
      notYet += 1;
      continue;
    }
    items.push({
      employee: {
        id: employee.id,
        fileNumber: employee.fileNumber,
        lastName: employee.lastName,
        firstName: employee.firstName,
      },
      seniority: formatSeniority(result.seniority),
      basis: result.proportional
        ? `Proporcional: ${result.workedDays} de ${result.periodWorkDays} días hábiles trabajados`
        : result.rule
          ? ruleRangeLabel(result.rule)
          : "Sin regla para esa antigüedad",
      proportional: result.proportional,
      days: result.days,
    });
  }
  return { year, cutoff, items, existing, notYet };
}

export type GenerationPreview = Awaited<ReturnType<typeof computeGeneration>>;

/** Genera los períodos que faltan en `year`, recalculados al confirmar. Los existentes no se tocan. */
export async function generateBalances(ctx: ActorContext, input: unknown) {
  await assertPermission(ctx, "leave:write", MODULE);
  const { year } = generateBalancesSchema.parse(input);
  const { items, cutoff } = await computeGeneration(year);
  if (items.length === 0) return { created: 0 };

  return repo.transaction(async (tx) => {
    let created = 0;
    for (const item of items) {
      // Otro usuario pudo generar el mismo período mientras tanto: se saltea.
      const existing = await tx.vacationBalance.findUnique({
        where: { employeeId_year: { employeeId: item.employee.id, year } },
        select: { id: true },
      });
      if (existing) continue;
      const balance = await repo.createBalance(
        {
          employeeId: item.employee.id,
          year,
          entitledDays: item.days,
          notes: `Generado con antigüedad al ${formatDate(cutoff)} (${item.seniority}). ${item.basis}.`,
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
          entityType: "VacationBalance",
          entityId: balance.id,
          after: { employeeId: item.employee.id, year, entitledDays: item.days, basis: item.basis },
          message: `Período de vacaciones ${year} de ${item.employee.lastName}, ${item.employee.firstName}: ${item.days} días`,
        },
        tx,
      );
      created += 1;
    }
    return { created };
  });
}

/** Ajuste manual (con motivo), días arrastrados y observaciones de un período. */
export async function updateBalance(ctx: ActorContext, id: string, input: unknown) {
  await assertPermission(ctx, "leave:write", MODULE);
  const { version } = balanceVersionSchema.parse(input);
  const data = balanceSchema.parse(input);
  const current = await repo.findBalance(id);
  if (!current) throw new NotFoundError("El período no existe.");

  await repo.transaction(async (tx) => {
    const usage = (await leaves.balanceUsage([id], null, tx)).get(id)!;
    const total = current.entitledDays + data.adjustmentDays + data.carriedOverDays;
    if (total < usage.used) {
      throw new ConflictError(
        `El período ya tiene ${usage.used} días aprobados: el total no puede quedar por debajo de eso.`,
        { adjustmentDays: [`El total quedaría en ${total} días.`] },
      );
    }
    const next = {
      adjustmentDays: data.adjustmentDays,
      adjustmentReason: data.adjustmentDays === 0 ? null : data.adjustmentReason,
      carriedOverDays: data.carriedOverDays,
      notes: data.notes,
    };
    const ok = await repo.updateBalanceVersioned(id, new Date(version), { ...next, updatedById: ctx.userId }, tx);
    if (!ok) {
      throw new ConflictError(
        "Otra persona modificó este período mientras lo editabas. Cerrá el formulario y volvé a abrirlo para ver los cambios.",
      );
    }
    const diff = auditDiff(
      {
        adjustmentDays: current.adjustmentDays,
        adjustmentReason: current.adjustmentReason,
        carriedOverDays: current.carriedOverDays,
        notes: current.notes,
      },
      next,
    );
    if (!diff) return;
    await recordAudit(
      ctx,
      {
        action: "UPDATE",
        module: MODULE,
        entityType: "VacationBalance",
        entityId: id,
        ...diff,
        message: `Período de vacaciones ${current.year} de ${current.employee.lastName}, ${current.employee.firstName}`,
      },
      tx,
    );
  });
}

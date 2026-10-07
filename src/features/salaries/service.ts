import "server-only";
import {
  addMonths,
  formatDate,
  formatPeriod,
  parseIsoDate,
  parsePeriod,
  periodKey,
  periodOf,
  todayInTimeZone,
  toIsoDate,
} from "@/lib/format";
import { paginate } from "@/lib/list/query";
import { decimalInput, sumAmounts } from "@/lib/validators/decimal";
import { auditDiff, recordAudit } from "@/server/audit";
import { assertPermission } from "@/server/authz";
import type { ActorContext } from "@/server/context";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { payrollWarnings, salaryVariation } from "./calc";
import type { ConceptNature } from "./constants";
import * as repo from "./repository";
import {
  payrollEmployeeSchema,
  payrollListQuerySchema,
  payrollRecordSchema,
  salaryChangeSchema,
  salaryChangeUpdateSchema,
  salaryListQuerySchema,
  type PayrollRecordInput,
} from "./schemas";

const MODULE = "remuneraciones";

const fullName = (e: { lastName: string; firstName: string }) => `${e.lastName}, ${e.firstName}`;

/** Importe guardado como texto con dos decimales (para comparar y auditar). */
const fixed = (value: { toString(): string } | null) => (value === null ? null : Number(value.toString()).toFixed(2));

/** La fecha tiene que caer dentro de la relación laboral del empleado. */
function assertInEmployment(employee: repo.SalaryEmployee, date: Date, field: string, what: string) {
  if (date < employee.hireDate) {
    throw new ValidationError(undefined, {
      [field]: [`${what} no puede ser anterior al ingreso (${formatDate(employee.hireDate)}).`],
    });
  }
  if (employee.exitDate && date > employee.exitDate) {
    throw new ValidationError(undefined, {
      [field]: [`${what} no puede ser posterior al egreso (${formatDate(employee.exitDate)}).`],
    });
  }
}

async function employeeOrThrow(employeeId: string) {
  const employee = await repo.findEmployee(employeeId);
  if (!employee) throw new NotFoundError("El empleado no existe.");
  return employee;
}

/* ----------------------------------------------------------------------------
 * Historial salarial
 * ------------------------------------------------------------------------- */

function toSalaryItem(row: repo.SalaryRow, previous: repo.SalaryRow | null, today: Date) {
  return {
    id: row.id,
    effectiveDate: row.effectiveDate,
    basicSalary: fixed(row.basicSalary)!,
    variation: salaryVariation(previous?.basicSalary ?? null, row.basicSalary),
    notes: row.notes,
    createdBy: row.createdBy.name,
    createdAt: row.createdAt,
    /** Rige a partir de una fecha posterior a hoy (no debería pasar: se cargan hasta hoy). */
    future: row.effectiveDate > today,
    version: row.updatedAt.toISOString(),
    formValues: {
      effectiveDate: toIsoDate(row.effectiveDate),
      basicSalary: decimalInput(row.basicSalary),
      notes: row.notes ?? "",
    },
  };
}

export type SalaryItem = ReturnType<typeof toSalaryItem>;

/** Historial salarial de un legajo, del más reciente al más antiguo, con el básico vigente. */
export async function getEmployeeSalaries(ctx: ActorContext, employeeId: string) {
  await assertPermission(ctx, "salary:read", MODULE);
  const today = todayInTimeZone();
  const rows = await repo.listSalaryHistory(employeeId);
  const items = rows.map((row, i) => toSalaryItem(row, rows[i + 1] ?? null, today));
  return { items, current: items.find((i) => !i.future) ?? null };
}

/**
 * Registra el básico pactado a partir de una fecha. Una fecha efectiva por
 * empleado; no se cargan cambios a futuro (igual que el historial laboral).
 */
export async function createSalaryChange(ctx: ActorContext, employeeId: string, input: unknown) {
  await assertPermission(ctx, "salary:write", MODULE);
  const data = salaryChangeSchema.parse(input);
  const employee = await employeeOrThrow(employeeId);
  const effectiveDate = parseIsoDate(data.effectiveDate)!;
  if (effectiveDate > todayInTimeZone()) {
    throw new ValidationError(undefined, {
      effectiveDate: ["No se registran cambios a futuro: cargalo cuando empiece a regir."],
    });
  }
  assertInEmployment(employee, effectiveDate, "effectiveDate", "La fecha");
  if (await repo.findSalaryOn(employeeId, effectiveDate)) {
    throw new ConflictError("Ya hay un básico cargado con esa fecha: modificalo desde el historial.", {
      effectiveDate: ["Ya hay un básico con esa fecha."],
    });
  }

  return repo.transaction(async (tx) => {
    const created = await repo.createSalary(
      { employeeId, effectiveDate, basicSalary: data.basicSalary, notes: data.notes, createdById: ctx.userId },
      tx,
    );
    await recordAudit(
      ctx,
      {
        action: "CREATE",
        module: MODULE,
        entityType: "SalaryHistory",
        entityId: created.id,
        after: { employeeId, effectiveDate: data.effectiveDate, basicSalary: data.basicSalary, notes: data.notes },
        message: `Básico de ${fullName(employee)} desde el ${formatDate(effectiveDate)}`,
      },
      tx,
    );
    return { id: created.id };
  });
}

/** Corrige el importe o las observaciones de un básico (la fecha no cambia). */
export async function updateSalaryChange(ctx: ActorContext, id: string, input: unknown) {
  await assertPermission(ctx, "salary:write", MODULE);
  const data = salaryChangeUpdateSchema.parse(input);
  const current = await repo.findSalary(id);
  if (!current) throw new NotFoundError();
  if (data.effectiveDate !== toIsoDate(current.effectiveDate)) {
    throw new ValidationError(undefined, {
      effectiveDate: ["La fecha no se puede cambiar: registrá un básico nuevo con la fecha correcta."],
    });
  }
  const before = { basicSalary: fixed(current.basicSalary), notes: current.notes };
  const after = { basicSalary: data.basicSalary, notes: data.notes };
  const diff = auditDiff(before, after);
  if (!diff) return { id };

  await repo.transaction(async (tx) => {
    const version = data.version ? new Date(data.version) : current.updatedAt;
    const ok = await repo.updateSalaryVersioned(id, version, after, tx);
    if (!ok) {
      throw new ConflictError("Otra persona modificó este básico mientras editabas. Volvé a abrir el formulario.");
    }
    await recordAudit(
      ctx,
      {
        action: "UPDATE",
        module: MODULE,
        entityType: "SalaryHistory",
        entityId: id,
        ...diff,
        message: `Corrección del básico desde el ${formatDate(current.effectiveDate)}`,
      },
      tx,
    );
  });
  return { id };
}

export type CurrentSalaryItem = Awaited<ReturnType<typeof listCurrentSalaries>>["items"][number];

/** Listado "Básicos vigentes": un renglón por empleado con su básico a hoy. */
export async function listCurrentSalaries(ctx: ActorContext, rawQuery: unknown) {
  await assertPermission(ctx, "salary:read", MODULE);
  const query = salaryListQuerySchema.parse(rawQuery);
  const today = todayInTimeZone();
  const { items, total, withoutSalary } = await repo.listSalaryEmployees(query, today);
  const salaries = await repo.currentSalaries(
    items.map((e) => e.id),
    today,
  );
  return {
    ...paginate(
      items.map((employee) => {
        const entry = salaries.get(employee.id);
        return {
          employee: {
            id: employee.id,
            fileNumber: employee.fileNumber,
            name: fullName(employee),
            status: employee.status,
            department: employee.department.name,
            position: employee.position.name,
            category: employee.category?.name ?? null,
          },
          salary: entry
            ? {
                basicSalary: fixed(entry.current.basicSalary)!,
                effectiveDate: entry.current.effectiveDate,
                previous: fixed(entry.previous?.basicSalary ?? null),
                variation: salaryVariation(entry.previous?.basicSalary ?? null, entry.current.basicSalary),
              }
            : null,
        };
      }),
      total,
      query.page,
      query.pageSize,
    ),
    withoutSalary,
    query,
  };
}

/* ----------------------------------------------------------------------------
 * Resúmenes informados
 * ------------------------------------------------------------------------- */

function toPayrollItem(row: repo.PayrollRow) {
  const lines = row.lines.map((line) => ({
    id: line.id,
    concept: line.conceptType.name,
    nature: line.conceptType.nature as ConceptNature,
    description: line.description,
    quantity: line.quantity === null ? null : Number(line.quantity.toString()),
    amount: fixed(line.amount)!,
  }));
  return {
    id: row.id,
    period: row.period,
    employee: row.employee,
    source: row.source,
    grossReported: fixed(row.grossReported)!,
    deductionsReported: fixed(row.deductionsReported)!,
    netReported: fixed(row.netReported)!,
    notes: row.notes,
    lines,
    warnings: payrollWarnings({
      gross: row.grossReported,
      deductions: row.deductionsReported,
      net: row.netReported,
      lines,
    }),
    version: row.updatedAt.toISOString(),
    formValues: {
      period: periodKey(row.period),
      grossReported: decimalInput(row.grossReported),
      deductionsReported: decimalInput(row.deductionsReported),
      netReported: decimalInput(row.netReported),
      notes: row.notes ?? "",
      lines: row.lines.map((line) => ({
        conceptTypeId: line.conceptTypeId,
        description: line.description ?? "",
        quantity: line.quantity === null ? "" : decimalInput(line.quantity).replace(/,00$/, ""),
        amount: decimalInput(line.amount),
      })),
    },
  };
}

export type PayrollItem = ReturnType<typeof toPayrollItem>;

const totalsOf = (items: PayrollItem[]) => ({
  count: items.length,
  gross: sumAmounts(items.map((i) => i.grossReported)),
  deductions: sumAmounts(items.map((i) => i.deductionsReported)),
  net: sumAmounts(items.map((i) => i.netReported)),
  withWarnings: items.filter((i) => i.warnings.length > 0).length,
});

/**
 * Resúmenes informados de un período (por defecto, el último con datos), con
 * los totales del filtro y la navegación entre meses.
 */
export async function listPayrolls(ctx: ActorContext, rawQuery: unknown) {
  await assertPermission(ctx, "salary:read", MODULE);
  const parsed = payrollListQuerySchema.parse(rawQuery);
  const periods = await repo.payrollPeriods();
  const fallback = periods[0]?.period ?? addMonths(periodOf(todayInTimeZone()), -1);
  const period = parsed.periodo ? parsePeriod(parsed.periodo)! : fallback;
  const query = { ...parsed, periodo: periodKey(period) };
  const all = (await repo.listPayrolls(query)).map(toPayrollItem);
  const filtered = query.revisar ? all.filter((i) => i.warnings.length > 0) : all;
  const start = (query.page - 1) * query.pageSize;
  return {
    ...paginate(filtered.slice(start, start + query.pageSize), filtered.length, query.page, query.pageSize),
    totals: totalsOf(all),
    period,
    label: formatPeriod(period),
    prev: periodKey(addMonths(period, -1)),
    next: period < periodOf(todayInTimeZone()) ? periodKey(addMonths(period, 1)) : null,
    periods: periods.map((p) => ({ value: periodKey(p.period), label: formatPeriod(p.period), count: p.count })),
    query,
  };
}

export async function getEmployeePayrolls(ctx: ActorContext, employeeId: string) {
  await assertPermission(ctx, "salary:read", MODULE);
  return (await repo.listEmployeePayrolls(employeeId)).map(toPayrollItem);
}

export async function getConceptOptions(ctx: ActorContext, includeIds: string[] = []) {
  await assertPermission(ctx, "salary:write", MODULE);
  const rows = await repo.listConceptOptions(includeIds);
  return rows.map((r) => ({ id: r.id, label: r.name, nature: r.nature as ConceptNature, isActive: r.isActive }));
}

export type ConceptOption = Awaited<ReturnType<typeof getConceptOptions>>[number];

export async function getEmployeeOptions(ctx: ActorContext) {
  await assertPermission(ctx, "salary:write", MODULE);
  return repo.listEmployeeOptions();
}

export async function getDepartmentOptions(ctx: ActorContext) {
  await assertPermission(ctx, "salary:read", MODULE);
  return repo.listDepartments();
}

/** Valida período, conceptos y empleado; devuelve los datos listos y los avisos. */
async function preparePayroll(
  employee: repo.SalaryEmployee,
  data: PayrollRecordInput,
  current: repo.PayrollRow | null,
) {
  const period = parsePeriod(data.period)!;
  if (period > periodOf(todayInTimeZone())) {
    throw new ValidationError(undefined, { period: ["No se cargan resúmenes de meses futuros."] });
  }
  if (periodOf(employee.hireDate) > period) {
    throw new ValidationError(undefined, {
      period: [`El empleado ingresó el ${formatDate(employee.hireDate)}: el período no puede ser anterior.`],
    });
  }
  if (employee.exitDate && periodOf(employee.exitDate) < period) {
    throw new ValidationError(undefined, {
      period: [`El empleado egresó el ${formatDate(employee.exitDate)}: el período no puede ser posterior.`],
    });
  }
  const conceptIds = [...new Set(data.lines.map((l) => l.conceptTypeId))];
  const concepts = new Map((await repo.conceptTypes(conceptIds)).map((c) => [c.id, c]));
  const previousIds = new Set(current?.lines.map((l) => l.conceptTypeId) ?? []);
  const errors: Record<string, string[]> = {};
  data.lines.forEach((line, i) => {
    const concept = concepts.get(line.conceptTypeId);
    if (!concept) errors[`lines.${i}.conceptTypeId`] = ["El concepto no existe."];
    else if (!concept.isActive && !previousIds.has(concept.id)) {
      errors[`lines.${i}.conceptTypeId`] = ["El concepto está desactivado."];
    }
  });
  if (Object.keys(errors).length > 0) throw new ValidationError(undefined, errors);
  const warnings = payrollWarnings({
    gross: data.grossReported,
    deductions: data.deductionsReported,
    net: data.netReported,
    lines: data.lines.map((l) => ({
      nature: concepts.get(l.conceptTypeId)!.nature as ConceptNature,
      amount: l.amount,
    })),
  });
  return { period, warnings };
}

const auditablePayroll = (r: {
  period: Date;
  grossReported: unknown;
  deductionsReported: unknown;
  netReported: unknown;
  notes: string | null;
  lines: { conceptTypeId: string; description: string | null; quantity: unknown; amount: unknown }[];
}) => ({
  period: periodKey(r.period),
  grossReported: fixed(r.grossReported as string),
  deductionsReported: fixed(r.deductionsReported as string),
  netReported: fixed(r.netReported as string),
  notes: r.notes,
  lines: r.lines.map((l) => ({
    conceptTypeId: l.conceptTypeId,
    description: l.description,
    quantity: l.quantity === null ? null : fixed(l.quantity as string),
    amount: fixed(l.amount as string),
  })),
});

/** Alta de un resumen informado: uno por empleado y período. */
export async function createPayroll(ctx: ActorContext, employeeId: string | null, input: unknown) {
  await assertPermission(ctx, "salary:write", MODULE);
  const target = employeeId ?? payrollEmployeeSchema.parse(input).employeeId;
  const data = payrollRecordSchema.parse(input);
  const employee = await employeeOrThrow(target);
  const { period, warnings } = await preparePayroll(employee, data, null);
  if (await repo.findPayrollFor(target, period)) {
    throw new ConflictError(`${fullName(employee)} ya tiene el resumen de ${formatPeriod(period)}: modificalo.`, {
      period: ["Ya hay un resumen de ese período."],
    });
  }

  return repo.transaction(async (tx) => {
    const created = await repo.createPayroll(
      {
        employeeId: target,
        period,
        source: "MANUAL",
        grossReported: data.grossReported,
        deductionsReported: data.deductionsReported,
        netReported: data.netReported,
        notes: data.notes,
        createdById: ctx.userId,
        updatedById: ctx.userId,
        lines: { create: data.lines },
      },
      tx,
    );
    await recordAudit(
      ctx,
      {
        action: "CREATE",
        module: MODULE,
        entityType: "PayrollRecord",
        entityId: created.id,
        after: { employeeId: target, ...auditablePayroll(created) },
        message: `Resumen informado de ${fullName(employee)}, ${formatPeriod(period)}`,
      },
      tx,
    );
    return { id: created.id, warnings };
  });
}

/** Modifica un resumen; los renglones se reemplazan por los del formulario. */
export async function updatePayroll(ctx: ActorContext, id: string, input: unknown) {
  await assertPermission(ctx, "salary:write", MODULE);
  const data = payrollRecordSchema.parse(input);
  const current = await repo.findPayroll(id);
  if (!current) throw new NotFoundError();
  const employee = await employeeOrThrow(current.employeeId);
  const { period, warnings } = await preparePayroll(employee, data, current);
  if (period.getTime() !== current.period.getTime() && (await repo.findPayrollFor(current.employeeId, period))) {
    throw new ConflictError(`${fullName(employee)} ya tiene el resumen de ${formatPeriod(period)}.`, {
      period: ["Ya hay un resumen de ese período."],
    });
  }
  const after = { ...data, period, lines: data.lines };
  const diff = auditDiff(auditablePayroll(current), auditablePayroll(after));
  if (!diff) return { id, warnings };

  await repo.transaction(async (tx) => {
    const ok = await repo.updatePayrollVersioned(
      id,
      data.version ? new Date(data.version) : current.updatedAt,
      {
        period,
        grossReported: data.grossReported,
        deductionsReported: data.deductionsReported,
        netReported: data.netReported,
        notes: data.notes,
        updatedById: ctx.userId,
      },
      data.lines.map((line) => ({ ...line, payrollRecordId: id })),
      tx,
    );
    if (!ok) {
      throw new ConflictError("Otra persona modificó este resumen mientras editabas. Volvé a abrir el formulario.");
    }
    await recordAudit(
      ctx,
      {
        action: "UPDATE",
        module: MODULE,
        entityType: "PayrollRecord",
        entityId: id,
        ...diff,
        message: `Modificación del resumen informado de ${fullName(employee)}, ${formatPeriod(period)}`,
      },
      tx,
    );
  });
  return { id, warnings };
}

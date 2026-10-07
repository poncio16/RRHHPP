import "server-only";
import { alertOverview } from "@/features/alerts/service";
import { workDaysOf } from "@/features/leaves/service";
import { balanceUsage, holidaysBetween } from "@/features/leaves/repository";
import { addMonths, parsePeriod, periodEnd, periodOf, todayInTimeZone } from "@/lib/format";
import { z } from "@/lib/zod";
import { hasPermission } from "@/server/authz";
import type { ActorContext } from "@/server/context";
import { getSetting } from "@/server/settings";
import { absenteeism, distribution, yearsBetween } from "./calc";
import * as repo from "./repository";

const querySchema = z.object({ periodo: z.string().optional().catch(undefined) });

const NO_DATA = "Sin dato";

/**
 * Indicadores del inicio. Cada bloque se calcula solo si quien mira tiene el
 * permiso del módulo de origen; si no, vuelve `null` y la pantalla no lo muestra.
 */
export async function getDashboard(ctx: ActorContext, rawQuery: unknown = {}) {
  const query = querySchema.parse(rawQuery);
  const today = todayInTimeZone();
  const current = periodOf(today);
  const requested = query.periodo ? parsePeriod(query.periodo) : null;
  // No hay indicadores de meses futuros: se toma el mes en curso.
  const period = requested && requested <= current ? requested : current;
  const start = period;
  const end = periodEnd(period);
  // El ausentismo del mes en curso se mide hasta hoy.
  const measuredUntil = end > today ? today : end;

  const can = (permission: Parameters<typeof hasPermission>[1]) => hasPermission(ctx, permission);

  const [staff, movements, absence, leaves, alerts] = await Promise.all([
    can("employee:read") ? staffBlock(today) : null,
    can("employee:read") ? movementsBlock(start, end, can("exit:read")) : null,
    can("attendance:read") && can("leave:read") ? absenceBlock(start, measuredUntil) : null,
    can("leave:read") ? leavesBlock(today, can("document.sensitive:read")) : null,
    can("employee:read") ? alertOverview(ctx) : null,
  ]);

  return {
    period,
    isCurrent: period.getTime() === current.getTime(),
    previous: addMonths(period, -1),
    next: period < current ? addMonths(period, 1) : null,
    measuredUntil,
    staff,
    movements,
    absence,
    leaves,
    alerts,
  };
}
export type Dashboard = Awaited<ReturnType<typeof getDashboard>>;

async function staffBlock(today: Date) {
  const [counts, active] = await Promise.all([repo.headcount(), repo.activeEmployees()]);
  const seniority =
    active.length > 0
      ? active.reduce((sum, e) => sum + Math.max(0, yearsBetween(e.seniorityDate, today)), 0) / active.length
      : null;
  return {
    active: counts.ACTIVO ?? 0,
    inactive: counts.EGRESADO ?? 0,
    total: (counts.ACTIVO ?? 0) + (counts.EGRESADO ?? 0),
    averageSeniority: seniority,
    byDepartment: distribution(active.map((e) => e.department.name)),
    byPosition: distribution(active.map((e) => e.position.name)),
    byContract: distribution(active.map((e) => e.contractType.name)),
    byModality: distribution(active.map((e) => e.workModality?.label ?? NO_DATA)),
  };
}

async function movementsBlock(start: Date, end: Date, canSeeExits: boolean) {
  const [hires, exits] = await Promise.all([
    repo.hiresBetween(start, end),
    canSeeExits ? repo.exitsBetween(start, end) : null,
  ]);
  return { hires, exits };
}

async function absenceBlock(start: Date, end: Date) {
  const [employees, absentDays, leaves, holidays, { defaultWorkDays }] = await Promise.all([
    repo.employeesInPeriod(start, end),
    repo.absentDaysBetween(start, end),
    repo.absenteeismLeavesBetween(start, end),
    holidaysBetween(start, end),
    getSetting("leaves"),
  ]);
  const result = absenteeism({
    start,
    end,
    holidays,
    absentDays,
    leaves,
    employees: employees.map((e) => ({
      id: e.id,
      hireDate: e.hireDate,
      exitDate: e.exitDate,
      workDays: workDaysOf(e, defaultWorkDays),
    })),
  });
  return { ...result, from: start, until: end };
}

async function leavesBlock(today: Date, canSeeHealth: boolean) {
  const [current, balances] = await Promise.all([
    repo.leavesOn(today),
    repo.vacationBalancesUpTo(today.getUTCFullYear()),
  ]);
  const usage = await balanceUsage(balances.map((b) => b.id));
  const pendingByEmployee = new Map<string, number>();
  for (const b of balances) {
    const left = b.entitledDays + b.adjustmentDays + b.carriedOverDays - (usage.get(b.id)?.used ?? 0);
    if (left > 0) pendingByEmployee.set(b.employeeId, (pendingByEmployee.get(b.employeeId) ?? 0) + left);
  }
  return {
    current: current.map((l) => {
      const hidden = l.leaveType.isSensitive && !canSeeHealth;
      return {
        id: l.id,
        employee: l.employee,
        startDate: l.startDate,
        endDate: l.endDate,
        type: hidden ? "Licencia (dato reservado)" : l.leaveType.name,
        leaveClass: l.leaveType.class,
      };
    }),
    // Suspendido no es un estado guardado: es tener hoy una suspensión aprobada.
    suspended: new Set(current.filter((l) => l.leaveType.class === "SUSPENSION").map((l) => l.employee.id)).size,
    pendingVacationDays: [...pendingByEmployee.values()].reduce((a, b) => a + b, 0),
    pendingVacationPeople: pendingByEmployee.size,
  };
}

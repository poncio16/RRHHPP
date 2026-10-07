import "server-only";
import { balanceUsage } from "@/features/leaves/repository";
import { formatDate, todayInTimeZone } from "@/lib/format";
import { z } from "@/lib/zod";
import { recordAudit } from "@/server/audit";
import { assertPermission, hasPermission } from "@/server/authz";
import type { ActorContext } from "@/server/context";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import { getSetting } from "@/server/settings";
import { addDays, ageOn, daysBetween, missingItems, missingText, nextBirthday, relativeDays } from "./build";
import { ALERT_KIND_LABELS, ALERT_KINDS, ALERT_PERMISSIONS, SNOOZE_DAYS, type AlertKind } from "./constants";
import * as repo from "./repository";

const MODULE = "alertas";

type EmployeeRef = { id: string; fileNumber: number; lastName: string; firstName: string };

export type Alert = {
  /** Identifica la alerta para descartarla: clase, entidad y fecha que la origina. */
  key: string;
  kind: AlertKind;
  employee: EmployeeRef;
  /** Fecha que la origina (vencimiento, fin, inicio, cumpleaños). */
  date: Date;
  title: string;
  detail: string;
  tone: "destructive" | "warning" | "default";
  href: string;
};

const name = (e: EmployeeRef) => `${e.lastName}, ${e.firstName}`;
const key = (kind: AlertKind, id: string, date: Date | string) =>
  `${kind}:${id}:${typeof date === "string" ? date : date.toISOString().slice(0, 10)}`;

/** Clases de alerta que puede ver quien consulta. */
export function visibleKinds(ctx: ActorContext): AlertKind[] {
  return ALERT_KINDS.filter((k) => hasPermission(ctx, ALERT_PERMISSIONS[k].read));
}

/**
 * Calcula las alertas vigentes hoy (sin mirar descartes). Cada clase se
 * consulta solo si quien mira tiene su permiso.
 */
async function computeAlerts(ctx: ActorContext, today: Date): Promise<Alert[]> {
  const kinds = new Set(visibleKinds(ctx));
  const [settings, documentSettings] = await Promise.all([getSetting("alerts"), getSetting("documents")]);
  const alerts: Alert[] = [];
  const canSeeHealth = hasPermission(ctx, "document.sensitive:read");

  const tasks: Promise<void>[] = [];

  if (kinds.has("DOCUMENTO")) {
    tasks.push(
      (async () => {
        // Se consulta con la mayor anticipación posible y se filtra por la de cada tipo.
        const rows = await repo.expiringDocuments(addDays(today, 365));
        for (const d of rows) {
          if (d.documentType.isSensitive && !canSeeHealth) continue;
          const days = daysBetween(today, d.expiryDate!);
          if (days > (d.documentType.alertDaysBefore ?? documentSettings.alertDaysBefore)) continue;
          alerts.push({
            key: key("DOCUMENTO", d.id, d.expiryDate!),
            kind: "DOCUMENTO",
            employee: d.employee,
            date: d.expiryDate!,
            title: days < 0 ? `${d.documentType.name} vencido` : `${d.documentType.name} por vencer`,
            detail: `${days < 0 ? "Venció" : "Vence"} el ${formatDate(d.expiryDate!)} (${relativeDays(days).toLowerCase()}).`,
            tone: days < 0 ? "destructive" : "warning",
            href: `/empleados/${d.employee.id}/documentacion`,
          });
        }
      })(),
    );
  }

  if (kinds.has("LICENCIA") && settings.leaveEndingDays > 0) {
    tasks.push(
      (async () => {
        for (const l of await repo.endingLeaves(today, addDays(today, settings.leaveEndingDays))) {
          const hidden = l.leaveType.isSensitive && !canSeeHealth;
          const days = daysBetween(today, l.endDate);
          alerts.push({
            key: key("LICENCIA", l.id, l.endDate),
            kind: "LICENCIA",
            employee: l.employee,
            date: l.endDate,
            title: `${hidden ? "Licencia (dato reservado)" : l.leaveType.name}: termina ${relativeDays(days).toLowerCase()}`,
            detail: `Del ${formatDate(l.startDate)} al ${formatDate(l.endDate)}. Revisá el reintegro.`,
            tone: "default",
            href: `/empleados/${l.employee.id}/licencias`,
          });
        }
      })(),
    );
  }

  if (kinds.has("VACACIONES") && settings.vacationStartingDays > 0) {
    tasks.push(
      (async () => {
        for (const v of await repo.upcomingVacations(today, addDays(today, settings.vacationStartingDays))) {
          const days = daysBetween(today, v.startDate);
          alerts.push({
            key: key("VACACIONES", v.id, v.startDate),
            kind: "VACACIONES",
            employee: v.employee,
            date: v.startDate,
            title: `Vacaciones: empiezan ${relativeDays(days).toLowerCase()}`,
            detail: `Del ${formatDate(v.startDate)} al ${formatDate(v.endDate)} (${v.days} días).`,
            tone: "default",
            href: `/empleados/${v.employee.id}/licencias`,
          });
        }
      })(),
    );
  }

  if (kinds.has("PERIODO_VACACIONES")) {
    tasks.push(
      (async () => {
        const balances = await repo.pastVacationBalances(today.getUTCFullYear());
        const usage = await balanceUsage(balances.map((b) => b.id));
        for (const b of balances) {
          const pending = b.entitledDays + b.adjustmentDays + b.carriedOverDays - usage.get(b.id)!.used;
          if (pending <= 0) continue;
          alerts.push({
            // La clave incluye el saldo: si cambia, la alerta vuelve a aparecer.
            key: key("PERIODO_VACACIONES", b.id, String(pending)),
            kind: "PERIODO_VACACIONES",
            employee: b.employee,
            date: new Date(Date.UTC(b.year, 11, 31)),
            title: `Vacaciones ${b.year}: ${pending === 1 ? "queda 1 día" : `quedan ${pending} días`}`,
            detail: "Período de un año anterior con días sin usar.",
            tone: "warning",
            href: `/empleados/${b.employee.id}/licencias`,
          });
        }
      })(),
    );
  }

  if (kinds.has("CONTRATO") && settings.contractEndingDays > 0) {
    tasks.push(
      (async () => {
        for (const e of await repo.endingContracts(addDays(today, settings.contractEndingDays))) {
          const days = daysBetween(today, e.contractEndDate!);
          alerts.push({
            key: key("CONTRATO", e.id, e.contractEndDate!),
            kind: "CONTRATO",
            employee: e,
            date: e.contractEndDate!,
            title: days < 0 ? "Contrato a plazo vencido" : "Contrato a plazo por terminar",
            detail: `${days < 0 ? "Terminó" : "Termina"} el ${formatDate(e.contractEndDate!)} (${relativeDays(days).toLowerCase()}). Registrá la renovación o el egreso.`,
            tone: days < 0 ? "destructive" : "warning",
            href: `/empleados/${e.id}`,
          });
        }
      })(),
    );
  }

  if (kinds.has("CUMPLEANOS") && settings.birthdayDays > 0) {
    tasks.push(
      (async () => {
        const until = addDays(today, settings.birthdayDays);
        for (const e of await repo.activeBirthdays()) {
          const birthday = nextBirthday(e.birthDate, today);
          if (birthday > until) continue;
          const days = daysBetween(today, birthday);
          alerts.push({
            key: key("CUMPLEANOS", e.id, birthday),
            kind: "CUMPLEANOS",
            employee: e,
            date: birthday,
            title: `Cumpleaños ${relativeDays(days).toLowerCase()}`,
            detail: `${formatDate(birthday).slice(0, 5)}: cumple ${ageOn(e.birthDate, birthday)} años.`,
            tone: "default",
            href: `/empleados/${e.id}`,
          });
        }
      })(),
    );
  }

  if (kinds.has("LEGAJO")) {
    tasks.push(
      (async () => {
        const scope = {
          personal: hasPermission(ctx, "employee.personal:read"),
          bank: hasPermission(ctx, "employee.bank:read"),
          salary: hasPermission(ctx, "salary:read"),
        };
        for (const e of await repo.activeLegajos()) {
          const missing = missingItems(e, scope);
          if (missing.length === 0) continue;
          alerts.push({
            // Si cambia lo que falta, la alerta vuelve a aparecer.
            key: key("LEGAJO", e.id, missing.join("+")),
            kind: "LEGAJO",
            employee: e,
            date: today,
            title: "Legajo incompleto",
            detail: missingText(missing),
            tone: "default",
            href: `/empleados/${e.id}`,
          });
        }
      })(),
    );
  }

  await Promise.all(tasks);
  return alerts.sort(
    (a, b) =>
      ALERT_KINDS.indexOf(a.kind) - ALERT_KINDS.indexOf(b.kind) ||
      a.date.getTime() - b.date.getTime() ||
      name(a.employee).localeCompare(name(b.employee), "es"),
  );
}

export const ALERT_FILTERS = ["pendientes", "pospuestas", "descartadas"] as const;

const listQuerySchema = z.object({
  tipo: z.enum(ALERT_KINDS).optional().catch(undefined),
  estado: z.enum(ALERT_FILTERS).catch("pendientes").default("pendientes"),
});

type AlertState = (typeof ALERT_FILTERS)[number];

/** Todas las alertas de hoy con su estado de descarte. */
async function alertsWithState(ctx: ActorContext) {
  const today = todayInTimeZone();
  const all = await computeAlerts(ctx, today);
  const dismissals = new Map((await repo.listDismissals(all.map((a) => a.key))).map((d) => [d.alertKey, d]));
  return all.map((alert) => {
    const d = dismissals.get(alert.key);
    const state: AlertState = !d
      ? "pendientes"
      : d.dismissedUntil === null
        ? "descartadas"
        : d.dismissedUntil >= today
          ? "pospuestas"
          : "pendientes";
    return {
      ...alert,
      state,
      dismissal: d && state !== "pendientes" ? { until: d.dismissedUntil, by: d.dismissedBy.name } : null,
      canManage: hasPermission(ctx, ALERT_PERMISSIONS[alert.kind].manage),
    };
  });
}

function pendingCounts(ctx: ActorContext, items: { kind: AlertKind; state: AlertState }[]) {
  return Object.fromEntries(
    visibleKinds(ctx).map((k) => [k, items.filter((a) => a.kind === k && a.state === "pendientes").length]),
  ) as Partial<Record<AlertKind, number>>;
}

/**
 * Alertas con su estado: pendientes (sin descartar o con la posposición
 * vencida), pospuestas o descartadas. Las cuentas por clase son de pendientes.
 */
export async function listAlerts(ctx: ActorContext, rawQuery: unknown = {}) {
  await assertPermission(ctx, "employee:read", MODULE);
  const query = listQuerySchema.parse(rawQuery);
  const withState = await alertsWithState(ctx);
  const count = (state: AlertState) => withState.filter((a) => a.state === state).length;
  return {
    query,
    kinds: visibleKinds(ctx),
    counts: pendingCounts(ctx, withState),
    totals: { pendientes: count("pendientes"), pospuestas: count("pospuestas"), descartadas: count("descartadas") },
    items: withState.filter((a) => a.state === query.estado && (!query.tipo || a.kind === query.tipo)),
  };
}

/**
 * Para el inicio: todas las alertas de hoy (también las pospuestas o
 * descartadas, porque los próximos eventos se muestran igual) y las
 * pendientes por clase.
 */
export async function alertOverview(ctx: ActorContext) {
  await assertPermission(ctx, "employee:read", MODULE);
  const items = await alertsWithState(ctx);
  return { kinds: visibleKinds(ctx), counts: pendingCounts(ctx, items), items };
}

export type AlertItem = Awaited<ReturnType<typeof listAlerts>>["items"][number];

const dismissSchema = z.object({
  key: z.string().min(3).max(200),
  action: z.enum(["posponer", "descartar", "restaurar"]),
});

/**
 * Pospone (SNOOZE_DAYS días), descarta o vuelve a mostrar una alerta para
 * todos. Hace falta poder modificar el módulo de origen y que la alerta exista hoy.
 */
export async function changeAlertState(ctx: ActorContext, input: unknown) {
  await assertPermission(ctx, "employee:read", MODULE);
  const { key: alertKey, action } = dismissSchema.parse(input);
  const kind = alertKey.split(":")[0] as AlertKind;
  if (!ALERT_KINDS.includes(kind)) throw new NotFoundError("La alerta no existe.");
  if (!hasPermission(ctx, ALERT_PERMISSIONS[kind].manage)) throw new ForbiddenError();
  const today = todayInTimeZone();
  const alert = (await computeAlerts(ctx, today)).find((a) => a.key === alertKey);
  if (!alert) throw new NotFoundError("La alerta ya no está vigente. Actualizá la página.");

  const until = action === "posponer" ? addDays(today, SNOOZE_DAYS) : null;
  if (action === "restaurar") await repo.deleteDismissal(alertKey);
  else await repo.upsertDismissal(alertKey, until, ctx.userId);
  await recordAudit(ctx, {
    action: "UPDATE",
    module: MODULE,
    entityType: "AlertDismissal",
    entityId: undefined,
    after: { alertKey, action, until: until ? until.toISOString().slice(0, 10) : null },
    message: `${action === "posponer" ? "Alerta pospuesta" : action === "descartar" ? "Alerta descartada" : "Alerta restaurada"}: ${ALERT_KIND_LABELS[kind]} de ${name(alert.employee)}`,
  });
  return { until };
}

import { LEAVE_CLASS_LABELS } from "@/features/leaves/constants";
import { salaryVariation } from "@/features/salaries/calc";
import { formatDate, formatMoney } from "@/lib/format";
import { CHANGE_TYPE_LABELS } from "./constants";

/*
 * Línea de tiempo del legajo: une ingreso, cambios laborales, básicos,
 * licencias aprobadas, egresos y reingresos. Función pura: recibe lo que
 * cada módulo ya guarda y lo que la persona puede ver.
 */

export type TimelineKind = "ingreso" | "laboral" | "salarial" | "licencia" | "egreso";

export type TimelineEvent = {
  id: string;
  date: Date;
  kind: TimelineKind;
  title: string;
  /** Renglones de detalle ("Puesto: Vendedor → Supervisor"). */
  lines: string[];
  notes: string | null;
  /** Etiqueta corta junto al título (estado o clase). */
  tag: { label: string; tone: "muted" | "warning" | "success" | "destructive" } | null;
  /** Quién lo registró o confirmó, en una frase corta. */
  by: string | null;
};

type HistoryRow = {
  id: string;
  changeSetId: string;
  changeType: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  effectiveDate: Date;
  notes: string | null;
  createdAt: Date;
  createdBy: { name: string };
};

type Amount = { toString(): string };

export type TimelineSources = {
  hireDate: Date;
  history: HistoryRow[];
  salaries: { id: string; effectiveDate: Date; basicSalary: Amount; notes: string | null }[] | null;
  leaves:
    | {
        id: string;
        startDate: Date;
        endDate: Date;
        days: number;
        notes: string | null;
        leaveType: { name: string; class: keyof typeof LEAVE_CLASS_LABELS; isSensitive: boolean };
      }[]
    | null;
  exits:
    | {
        id: string;
        exitDate: Date;
        status: "EN_TRAMITE" | "CONFIRMADO" | "ANULADO";
        notes: string | null;
        exitType: { label: string };
        exitReason: { label: string };
        confirmedBy: { name: string } | null;
      }[]
    | null;
  /** Puede ver los tipos de licencia marcados como dato de salud. */
  canSeeHealth: boolean;
};

const REHIRE_FIELDS: Record<string, string> = {
  hireDate: "Ingreso",
  seniorityDate: "Antigüedad reconocida",
  contractEndDate: "Fin de contrato",
};

/** "dd/mm/aaaa" (como se guarda en el historial) → fecha de calendario. */
function parseDisplayDate(value: string | null): Date | null {
  const match = value?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1]))) : null;
}

const change = (from: string | null, to: string | null) => `${from ?? "—"} → ${to ?? "—"}`;
const days = (n: number) => (n === 1 ? "1 día" : `${n} días`);

/** Orden de un mismo día: primero lo que cierra (egreso), al final lo que abre (ingreso). */
const KIND_ORDER: Record<TimelineKind, number> = { egreso: 0, licencia: 1, salarial: 2, laboral: 3, ingreso: 4 };

export function buildTimeline(sources: TimelineSources): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  // Cambios laborales y reingresos: una entrada por operación.
  const sets = new Map<string, HistoryRow[]>();
  for (const row of sources.history) sets.set(row.changeSetId, [...(sets.get(row.changeSetId) ?? []), row]);
  let firstHire: Date | null = null;
  for (const [setId, rows] of sets) {
    const head = rows[0]!;
    const rehire = rows.some((r) => r.changeType === "REINGRESO");
    if (rehire) {
      const previous = parseDisplayDate(rows.find((r) => r.field === "hireDate")?.oldValue ?? null);
      if (previous && (!firstHire || previous < firstHire)) firstHire = previous;
      events.push({
        id: `history-${setId}`,
        date: head.effectiveDate,
        kind: "ingreso",
        title: "Reingreso",
        lines: rows.map((r) => `${REHIRE_FIELDS[r.field] ?? r.field}: ${change(r.oldValue, r.newValue)}`),
        notes: head.notes,
        tag: null,
        by: `Registró ${head.createdBy.name}`,
      });
    } else {
      events.push({
        id: `history-${setId}`,
        date: head.effectiveDate,
        kind: "laboral",
        title:
          rows.length === 1 ? `Cambio de ${CHANGE_TYPE_LABELS[head.changeType]?.toLowerCase()}` : "Cambios laborales",
        lines: rows.map((r) => `${CHANGE_TYPE_LABELS[r.changeType] ?? r.field}: ${change(r.oldValue, r.newValue)}`),
        notes: head.notes,
        tag: null,
        by: `Registró ${head.createdBy.name}`,
      });
    }
  }

  // Ingreso original: el actual o, si hubo reingresos, el anterior al primero.
  events.push({
    id: "hire",
    date: firstHire ?? sources.hireDate,
    kind: "ingreso",
    title: "Ingreso",
    lines: [],
    notes: null,
    tag: null,
    by: null,
  });

  if (sources.salaries) {
    let previous: Amount | null = null;
    for (const s of sources.salaries) {
      const variation = salaryVariation(previous, s.basicSalary);
      events.push({
        id: `salary-${s.id}`,
        date: s.effectiveDate,
        kind: "salarial",
        title: previous === null ? "Básico inicial" : "Cambio de básico",
        lines: [
          previous === null
            ? formatMoney(s.basicSalary)
            : `${change(formatMoney(previous), formatMoney(s.basicSalary))}${variation ? ` (${variation})` : ""}`,
        ],
        notes: s.notes,
        tag: null,
        by: null,
      });
      previous = s.basicSalary;
    }
  }

  for (const l of sources.leaves ?? []) {
    const hidden = l.leaveType.isSensitive && !sources.canSeeHealth;
    events.push({
      id: `leave-${l.id}`,
      date: l.startDate,
      kind: "licencia",
      title: hidden ? "Licencia (dato reservado)" : l.leaveType.name,
      lines: [
        l.startDate.getTime() === l.endDate.getTime()
          ? `${formatDate(l.startDate)} · ${days(l.days)}`
          : `Del ${formatDate(l.startDate)} al ${formatDate(l.endDate)} · ${days(l.days)}`,
      ],
      notes: hidden ? null : l.notes,
      tag: {
        label: LEAVE_CLASS_LABELS[l.leaveType.class],
        tone: l.leaveType.class === "SUSPENSION" ? "warning" : "muted",
      },
      by: null,
    });
  }

  // Los anulados quedan en la lista de egresos del legajo, no en la línea de tiempo.
  for (const e of (sources.exits ?? []).filter((x) => x.status !== "ANULADO")) {
    events.push({
      id: `exit-${e.id}`,
      date: e.exitDate,
      kind: "egreso",
      title: `Egreso: ${e.exitType.label}`,
      lines: [`Motivo: ${e.exitReason.label}`],
      notes: e.notes,
      tag:
        e.status === "CONFIRMADO"
          ? { label: "Confirmado", tone: "destructive" }
          : { label: "En trámite", tone: "warning" },
      by: e.confirmedBy ? `Confirmó ${e.confirmedBy.name}` : null,
    });
  }

  return events.sort(
    (a, b) =>
      b.date.getTime() - a.date.getTime() || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.id.localeCompare(b.id),
  );
}

export const TIMELINE_KIND_FILTER: Record<string, TimelineKind[]> = {
  laborales: ["ingreso", "laboral"],
  salariales: ["salarial"],
  licencias: ["licencia"],
  egresos: ["egreso", "ingreso"],
};

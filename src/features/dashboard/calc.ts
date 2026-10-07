import { absenceBreakdown, type AbsenceInput } from "@/features/reports/calc";

/*
 * Cálculos puros del inicio. Fechas de calendario en UTC.
 */

export type { AbsenceEmployee } from "@/features/reports/calc";

type DashboardAbsenceInput = Omit<AbsenceInput, "attendanceType" | "leaves"> & {
  /** Licencias aprobadas de tipos que cuentan para ausentismo. */
  leaves: { employeeId: string; startDate: Date; endDate: Date }[];
};

/**
 * Ausentismo del período: días de trabajo perdidos sobre días de trabajo
 * previstos, con el mismo cálculo que el reporte de ausentismo.
 */
export function absenteeism(input: DashboardAbsenceInput) {
  const byEmployee = absenceBreakdown({
    ...input,
    leaves: input.leaves.map((l) => ({ ...l, type: "" })),
    attendanceType: "",
  });
  let expected = 0;
  let lost = 0;
  let people = 0;
  for (const e of byEmployee.values()) {
    expected += e.expected;
    lost += e.lost;
    if (e.lost > 0) people++;
  }
  return { expected, lost, people, rate: expected > 0 ? lost / expected : null };
}

/** Años con un decimal entre dos fechas (antigüedad promedio). */
export function yearsBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (365.25 * 86_400_000);
}

/** Agrupa y ordena de mayor a menor; los nombres iguales se suman. */
export function distribution(labels: string[]): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  return [...counts]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "es"));
}

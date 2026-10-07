/**
 * Generación de novedades a partir de otros módulos (función pura): compara
 * lo que corresponde según los registros de origen con lo ya generado en el
 * período y arma el plan. Las novedades informadas no se tocan; las anuladas
 * a mano no se vuelven a crear.
 */

export type DesiredNovelty = {
  sourceType: string;
  sourceId: string;
  employeeId: string;
  noveltyTypeId: string;
  date: Date;
  quantity: string | null;
  amount: string | null;
  notes: string;
};

export type GeneratedNovelty = DesiredNovelty & {
  id: string;
  status: "PENDIENTE" | "APROBADA" | "INFORMADA" | "ANULADA";
};

export type GenerationPlan = {
  create: DesiredNovelty[];
  /** Pendientes o aprobadas cuyos datos cambiaron: se actualizan y vuelven a pendiente. */
  update: { current: GeneratedNovelty; next: DesiredNovelty }[];
  /** Pendientes o aprobadas cuyo origen ya no corresponde: se anulan. */
  annul: GeneratedNovelty[];
  /** Ya informadas que hoy darían otro resultado (o ninguno): solo se avisan. */
  informedChanged: { current: GeneratedNovelty; next: DesiredNovelty | null }[];
  unchanged: number;
  /** Anuladas a mano: se respetan. */
  skippedAnnulled: number;
};

export const sourceKey = (n: { sourceType: string; sourceId: string }) => `${n.sourceType}|${n.sourceId}`;

const decimal = (value: string | null) => (value === null ? null : Number(value).toFixed(2));

export function sameNovelty(a: DesiredNovelty, b: DesiredNovelty): boolean {
  return (
    a.employeeId === b.employeeId &&
    a.noveltyTypeId === b.noveltyTypeId &&
    a.date.getTime() === b.date.getTime() &&
    decimal(a.quantity) === decimal(b.quantity) &&
    decimal(a.amount) === decimal(b.amount) &&
    a.notes === b.notes
  );
}

export function planGeneration(desired: DesiredNovelty[], existing: GeneratedNovelty[]): GenerationPlan {
  const plan: GenerationPlan = {
    create: [],
    update: [],
    annul: [],
    informedChanged: [],
    unchanged: 0,
    skippedAnnulled: 0,
  };
  const current = new Map(existing.map((n) => [sourceKey(n), n]));
  const wanted = new Set<string>();
  for (const next of desired) {
    const key = sourceKey(next);
    wanted.add(key);
    const found = current.get(key);
    if (!found) plan.create.push(next);
    else if (found.status === "ANULADA") plan.skippedAnnulled += 1;
    else if (sameNovelty(found, next)) plan.unchanged += 1;
    else if (found.status === "INFORMADA") plan.informedChanged.push({ current: found, next });
    else plan.update.push({ current: found, next });
  }
  for (const found of existing) {
    if (wanted.has(sourceKey(found))) continue;
    if (found.status === "PENDIENTE" || found.status === "APROBADA") plan.annul.push(found);
    else if (found.status === "INFORMADA") plan.informedChanged.push({ current: found, next: null });
  }
  return plan;
}

/** Minutos → horas con dos decimales ("1.50" son una hora y media). */
export const minutesToHours = (minutes: number) => (Math.round((minutes / 60) * 100) / 100).toFixed(2);

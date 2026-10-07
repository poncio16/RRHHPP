import { formatMinutes } from "../calc";
import type { AttendanceSummary } from "../service";

/** Totales de los días filtrados: presencias, ausencias y horas. */
export function AttendanceSummaryTiles({ summary }: { summary: AttendanceSummary }) {
  const tiles = [
    { label: "Presentes", value: String(summary.present) },
    { label: "Ausentes", value: String(summary.absent) },
    { label: "Con licencia", value: String(summary.onLeave) },
    { label: "Horas trabajadas", value: formatMinutes(summary.workedMinutes) },
    { label: "Horas adicionales", value: formatMinutes(summary.extraMinutes) },
    {
      label: "Llegadas tarde",
      value: String(summary.lateDays),
      detail: summary.lateMinutes > 0 ? `${summary.lateMinutes} min en total` : undefined,
    },
  ];
  return (
    <dl className="bg-border grid grid-cols-2 gap-px overflow-hidden rounded-md border sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map((tile) => (
        <div key={tile.label} className="bg-card px-3 py-2">
          <dt className="text-muted-foreground text-xs">{tile.label}</dt>
          <dd className="text-lg font-semibold tabular-nums">{tile.value}</dd>
          {tile.detail && <dd className="text-muted-foreground text-xs">{tile.detail}</dd>}
        </div>
      ))}
    </dl>
  );
}

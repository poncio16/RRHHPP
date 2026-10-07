import { formatMoney } from "@/lib/format";
import type { NoveltySummary } from "../service";

/** Contadores por estado e importes (sin las anuladas) del filtro. */
export function NoveltySummaryTiles({ summary }: { summary: NoveltySummary }) {
  const tiles = [
    { label: "Pendientes", value: String(summary.pending) },
    { label: "Aprobadas", value: String(summary.approved) },
    { label: "Informadas", value: String(summary.reported) },
    { label: "Haberes", value: formatMoney(summary.haberes) },
    { label: "Descuentos", value: formatMoney(summary.descuentos) },
  ];
  return (
    <dl className="bg-border grid grid-cols-2 gap-px overflow-hidden rounded-md border sm:grid-cols-3 lg:grid-cols-5">
      {tiles.map((tile) => (
        <div key={tile.label} className="bg-card px-3 py-2">
          <dt className="text-muted-foreground text-xs">{tile.label}</dt>
          <dd className="text-lg font-semibold break-words tabular-nums">{tile.value}</dd>
        </div>
      ))}
    </dl>
  );
}

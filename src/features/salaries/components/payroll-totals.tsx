import { formatMoney } from "@/lib/format";

type Totals = { count: number; gross: string; deductions: string; net: string; withWarnings: number };

/** Totales del período: cantidad de resúmenes y sumas de lo informado. */
export function PayrollTotals({ totals }: { totals: Totals }) {
  const tiles = [
    {
      label: "Resúmenes",
      value: String(totals.count),
      detail: totals.withWarnings > 0 ? `${totals.withWarnings} con diferencias` : undefined,
    },
    { label: "Bruto informado", value: formatMoney(totals.gross) },
    { label: "Descuentos informados", value: formatMoney(totals.deductions) },
    { label: "Neto informado", value: formatMoney(totals.net) },
  ];
  return (
    <dl className="bg-border grid grid-cols-1 gap-px overflow-hidden rounded-md border min-[420px]:grid-cols-2 lg:grid-cols-4">
      {tiles.map((tile) => (
        <div key={tile.label} className="bg-card px-3 py-2">
          <dt className="text-muted-foreground text-xs">{tile.label}</dt>
          <dd className="text-lg font-semibold break-words tabular-nums">{tile.value}</dd>
          {tile.detail && <dd className="text-warning-foreground text-xs">{tile.detail}</dd>}
        </div>
      ))}
    </dl>
  );
}

import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Ingresos, retiros y saldo en recuadros. */
export function AccountTotals({ tiles }: { tiles: { label: string; value: string; balance?: boolean }[] }) {
  return (
    <dl className="bg-border grid grid-cols-1 gap-px overflow-hidden rounded-md border min-[420px]:grid-cols-3">
      {tiles.map((tile) => (
        <div key={tile.label} className="bg-card px-3 py-2">
          <dt className="text-muted-foreground text-xs">{tile.label}</dt>
          <dd
            className={cn(
              "text-lg font-semibold break-words tabular-nums",
              tile.balance && Number(tile.value) < 0 && "text-destructive",
            )}
          >
            {formatMoney(tile.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

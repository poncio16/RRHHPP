import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatInteger } from "@/lib/format";

const MAX_ROWS = 6;

/**
 * Distribución como barras horizontales de un solo color, con el valor escrito
 * al lado: la lista es a la vez el gráfico y su versión accesible.
 */
export function DistributionCard({ title, items }: { title: string; items: { label: string; count: number }[] }) {
  const total = items.reduce((sum, i) => sum + i.count, 0);
  const shown = items.length > MAX_ROWS ? items.slice(0, MAX_ROWS - 1) : items;
  const rest = items.slice(shown.length);
  const rows =
    rest.length > 0
      ? [...shown, { label: `Otros (${rest.length})`, count: rest.reduce((s, i) => s + i.count, 0) }]
      : shown;
  const max = Math.max(1, ...rows.map((r) => r.count));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">Sin personal activo.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => {
              const share = total > 0 ? Math.round((row.count / total) * 100) : 0;
              return (
                <li key={row.label} title={`${row.label}: ${row.count} (${share} %)`}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">{row.label}</span>
                    <span className="text-muted-foreground shrink-0 tabular-nums">
                      {formatInteger(row.count)} · {share} %
                    </span>
                  </div>
                  <div className="bg-muted mt-1 h-2 rounded-full" aria-hidden>
                    <div className="bg-primary h-2 rounded-full" style={{ width: `${(row.count / max) * 100}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

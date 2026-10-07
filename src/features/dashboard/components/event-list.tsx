import Link from "next/link";
import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Employee = { id: string; fileNumber: number; lastName: string; firstName: string };

export type EventRow = { key: string; employee: Employee; href?: string; primary: ReactNode; secondary?: ReactNode };

const MAX_ROWS = 6;

/** Tarjeta con una lista corta de personas y un enlace a la lista completa. */
export function EventList({
  title,
  rows,
  empty,
  moreHref,
  moreLabel = "Ver todo",
}: {
  title: string;
  rows: EventRow[];
  empty: string;
  moreHref?: string;
  moreLabel?: string;
}) {
  const shown = rows.slice(0, MAX_ROWS);
  return (
    <Card>
      <CardHeader className="flex-row items-baseline justify-between gap-2 pb-2">
        <CardTitle className="text-base">
          {title} <span className="text-muted-foreground font-normal tabular-nums">({rows.length})</span>
        </CardTitle>
        {moreHref && rows.length > 0 && (
          <Link href={moreHref} className="text-primary shrink-0 text-sm hover:underline">
            {rows.length > shown.length ? `${moreLabel} (${rows.length})` : moreLabel}
          </Link>
        )}
      </CardHeader>
      <CardContent>
        {shown.length === 0 ? (
          <p className="text-muted-foreground text-sm">{empty}</p>
        ) : (
          <ul className="divide-y text-sm">
            {shown.map((row) => (
              <li key={row.key} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2 first:pt-0">
                <span className="min-w-0">
                  <Link href={row.href ?? `/empleados/${row.employee.id}`} className="text-primary hover:underline">
                    {row.employee.lastName}, {row.employee.firstName}
                  </Link>
                  {row.secondary && <span className="text-muted-foreground block text-xs">{row.secondary}</span>}
                </span>
                <span className="text-muted-foreground shrink-0 tabular-nums">{row.primary}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

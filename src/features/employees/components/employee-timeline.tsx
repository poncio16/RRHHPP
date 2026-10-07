import { Briefcase, CalendarDays, LogIn, LogOut, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import type { TimelineEvent, TimelineKind } from "../timeline";

const ICONS: Record<TimelineKind, typeof Briefcase> = {
  ingreso: LogIn,
  laboral: Briefcase,
  salarial: Wallet,
  licencia: CalendarDays,
  egreso: LogOut,
};

/** Línea de tiempo del legajo, agrupada por año (más reciente primero). */
export function EmployeeTimeline({ events }: { events: TimelineEvent[] }) {
  const years = new Map<number, TimelineEvent[]>();
  for (const event of events) {
    const year = event.date.getUTCFullYear();
    years.set(year, [...(years.get(year) ?? []), event]);
  }
  return (
    <div className="flex flex-col gap-6 p-4">
      {[...years].map(([year, items]) => (
        <section key={year} aria-labelledby={`timeline-${year}`}>
          <h2 id={`timeline-${year}`} className="text-muted-foreground mb-3 text-sm font-semibold">
            {year}
          </h2>
          <ol className="border-border ml-3 flex flex-col gap-4 border-l">
            {items.map((event) => {
              const Icon = ICONS[event.kind];
              return (
                <li key={event.id} className="relative pl-6">
                  <span className="bg-card text-muted-foreground absolute top-0 -left-3 flex size-6 items-center justify-center rounded-full border">
                    <Icon className="size-3.5" aria-hidden />
                  </span>
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-muted-foreground text-sm whitespace-nowrap tabular-nums">
                      {formatDate(event.date)}
                    </span>
                    <span className="font-medium">{event.title}</span>
                    {event.tag && <Badge variant={event.tag.tone}>{event.tag.label}</Badge>}
                  </div>
                  {event.lines.map((line) => (
                    <p key={line} className="text-sm break-words">
                      {line}
                    </p>
                  ))}
                  {event.notes && (
                    <p className="text-muted-foreground text-sm break-words whitespace-pre-line">{event.notes}</p>
                  )}
                  {event.by && <p className="text-muted-foreground text-xs">{event.by}</p>}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

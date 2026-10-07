import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AccessDenied } from "@/components/feedback/access-denied";
import { EmptyState } from "@/components/feedback/empty-state";
import { ListSkeleton } from "@/components/feedback/list-skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { DateFilter } from "@/components/list/date-filter";
import { FilterSelect } from "@/components/list/filter-select";
import { SearchInput } from "@/components/list/search-input";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AttendanceSheet } from "@/features/attendance/components/attendance-sheet";
import { AttendanceTabs } from "@/features/attendance/components/attendance-tabs";
import { getDepartmentOptions, getSheet } from "@/features/attendance/service";
import { isoWeekday } from "@/features/leaves/days";
import { DAY_NAMES } from "@/features/schedules/calc";
import { formatDate, parseIsoDate, toIsoDate } from "@/lib/format";
import { flattenSearchParams } from "@/lib/list/query";
import { requirePageAccess } from "@/server/auth/request";

export const metadata: Metadata = { title: "Asistencia" };

type Props = PageProps<"/asistencia">;

export default function AttendancePage({ searchParams }: Props) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <AttendanceContent searchParams={searchParams} />
    </Suspense>
  );
}

async function AttendanceContent({ searchParams }: Pick<Props, "searchParams">) {
  const access = await requirePageAccess("attendance:read", "asistencia");
  if (!access.allowed) return <AccessDenied />;
  const { ctx } = access;
  const params = flattenSearchParams(await searchParams);
  const [sheet, departments] = await Promise.all([getSheet(ctx, params), getDepartmentOptions(ctx)]);
  const date = parseIsoDate(sheet.date)!;
  const dayHref = (offset: number) => {
    const next = new URLSearchParams(params);
    next.set("fecha", toIsoDate(new Date(date.getTime() + offset * 86_400_000)));
    return `/asistencia?${next.toString()}`;
  };
  const filtered = !!(sheet.query.q || sheet.query.sector);

  return (
    <>
      <PageHeader
        title="Asistencia"
        description="Fichadas, ausencias y horas de cada día, calculadas con el horario asignado a cada empleado."
      />
      <AttendanceTabs current="/asistencia" />
      <Card>
        <div className="flex flex-col gap-2 border-b p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={dayHref(-1)}
              className={buttonVariants({ variant: "outline", size: "icon" })}
              aria-label="Día anterior"
            >
              <ChevronLeft />
            </Link>
            <p className="min-w-44 text-center font-medium">
              {DAY_NAMES[isoWeekday(date) - 1]} {formatDate(date)}
            </p>
            {sheet.isToday ? (
              <span
                className={buttonVariants({
                  variant: "outline",
                  size: "icon",
                  className: "pointer-events-none opacity-50",
                })}
                aria-hidden
              >
                <ChevronRight />
              </span>
            ) : (
              <Link
                href={dayHref(1)}
                className={buttonVariants({ variant: "outline", size: "icon" })}
                aria-label="Día siguiente"
              >
                <ChevronRight />
              </Link>
            )}
            <DateFilter name="fecha" label="Ir al día" />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <SearchInput placeholder="Buscar por empleado o legajo" />
            {departments.length > 1 && (
              <FilterSelect
                name="sector"
                label="Sector"
                options={[
                  { value: "", label: "Todos los sectores" },
                  ...departments.map((d) => ({ value: d.id, label: d.name })),
                ]}
              />
            )}
          </div>
        </div>
        {sheet.rows.length === 0 ? (
          <EmptyState
            title={filtered ? "Nadie coincide con la búsqueda" : "No hay personal en relación laboral ese día"}
            description={filtered ? "Probá con otra búsqueda o cambiá el sector." : undefined}
          />
        ) : (
          <AttendanceSheet key={sheet.stamp} date={sheet.date} rows={sheet.rows} canEdit={sheet.canEdit} />
        )}
      </Card>
    </>
  );
}

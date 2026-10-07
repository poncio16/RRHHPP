import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/feedback/access-denied";
import { EmptyState } from "@/components/feedback/empty-state";
import { ListSkeleton } from "@/components/feedback/list-skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { Pagination } from "@/components/list/pagination";
import { SearchInput } from "@/components/list/search-input";
import { Card } from "@/components/ui/card";
import { AttendanceDialog } from "@/features/attendance/components/attendance-dialog";
import { AttendanceFilters } from "@/features/attendance/components/attendance-filters";
import { AttendanceSummaryTiles } from "@/features/attendance/components/attendance-summary";
import { AttendanceTable } from "@/features/attendance/components/attendance-table";
import { AttendanceTabs } from "@/features/attendance/components/attendance-tabs";
import { getDepartmentOptions, getEmployeeOptions, listDays } from "@/features/attendance/service";
import { todayInTimeZone, toIsoDate } from "@/lib/format";
import { flattenSearchParams } from "@/lib/list/query";
import { hasPermission } from "@/server/authz";
import { requirePageAccess } from "@/server/auth/request";

export const metadata: Metadata = { title: "Registros de asistencia" };

type Props = PageProps<"/asistencia/registros">;

export default function AttendanceRecordsPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <RecordsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function RecordsContent({ searchParams }: Pick<Props, "searchParams">) {
  const access = await requirePageAccess("attendance:read", "asistencia");
  if (!access.allowed) return <AccessDenied />;
  const { ctx } = access;
  const params = flattenSearchParams(await searchParams);
  const canEdit = hasPermission(ctx, "attendance:write");
  const [result, departments, employees] = await Promise.all([
    listDays(ctx, params),
    getDepartmentOptions(ctx),
    canEdit ? getEmployeeOptions(ctx) : Promise.resolve([]),
  ]);
  const today = toIsoDate(todayInTimeZone());
  const { query } = result;
  const filtered = !!(query.q || query.desde || query.hasta || query.sector || query.estado !== "todos");

  return (
    <>
      <PageHeader
        title="Asistencia"
        description="Fichadas, ausencias y horas de cada día, calculadas con el horario asignado a cada empleado."
        actions={canEdit && <AttendanceDialog employeeId={null} employees={employees} today={today} />}
      />
      <AttendanceTabs current="/asistencia/registros" />
      <Card>
        <div className="flex flex-col gap-2 p-3">
          <SearchInput placeholder="Buscar por empleado o legajo" />
          <AttendanceFilters departments={departments} />
          {result.total > 0 && <AttendanceSummaryTiles summary={result.summary} />}
        </div>
        {result.items.length === 0 ? (
          <EmptyState
            title={filtered ? "No hay días que coincidan" : "Todavía no hay asistencia cargada"}
            description={
              filtered ? "Probá con otra búsqueda o cambiá los filtros." : "Cargala desde la planilla diaria."
            }
          />
        ) : (
          <AttendanceTable items={result.items} showEmployee canEdit={canEdit} today={today} />
        )}
        <Pagination
          page={result.page}
          pageCount={result.pageCount}
          total={result.total}
          pageSize={result.pageSize}
          params={params}
        />
      </Card>
    </>
  );
}

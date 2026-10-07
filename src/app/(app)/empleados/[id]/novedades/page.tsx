import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/feedback/access-denied";
import { EmptyState } from "@/components/feedback/empty-state";
import { Pagination } from "@/components/list/pagination";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmployeeHeader } from "@/features/employees/components/employee-header";
import { loadEmployeePage } from "@/features/employees/page-data";
import { NoveltiesTable } from "@/features/novelties/components/novelties-table";
import { NoveltyDialog } from "@/features/novelties/components/novelty-dialog";
import { NoveltyFilters } from "@/features/novelties/components/novelty-filters";
import { NoveltySummaryTiles } from "@/features/novelties/components/novelty-summary";
import { getTypeOptions, listEmployeeNovelties } from "@/features/novelties/service";
import { periodKey, periodOf, todayInTimeZone, toIsoDate } from "@/lib/format";
import { flattenSearchParams } from "@/lib/list/query";
import { hasPermission } from "@/server/authz";

export const metadata: Metadata = { title: "Novedades del legajo" };

type Props = PageProps<"/empleados/[id]/novedades">;

export default function EmployeeNoveltiesPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Content params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ params, searchParams }: Props) {
  const page = await loadEmployeePage(params);
  if (!page.allowed || !page.canSeeNovelties) return <AccessDenied />;
  const { employee, ctx } = page;
  const query = flattenSearchParams(await searchParams);
  const canWrite = hasPermission(ctx, "novelty:write");
  const canReport = hasPermission(ctx, "novelty:report");
  const [result, types] = await Promise.all([listEmployeeNovelties(ctx, employee.id, query), getTypeOptions(ctx)]);
  const today = todayInTimeZone();
  const filtered = !!(result.query.tipo || result.query.origen || result.query.estado !== "vigentes");
  const { summary } = result;

  return (
    <>
      <EmployeeHeader employee={employee} current="novedades" access={page} />
      <Card>
        <div className="flex flex-col gap-3 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <NoveltyFilters types={types} />
            {canWrite && (
              <NoveltyDialog
                employeeId={employee.id}
                types={types}
                defaultDate={toIsoDate(today)}
                defaultPeriod={periodKey(periodOf(today))}
              />
            )}
          </div>
          {summary.pending + summary.approved + summary.reported + summary.annulled > 0 && (
            <NoveltySummaryTiles summary={summary} />
          )}
        </div>
        {result.items.length === 0 ? (
          <EmptyState
            title={filtered ? "No hay novedades que coincidan" : "Sin novedades registradas"}
            description={filtered ? "Cambiá los filtros." : undefined}
          />
        ) : (
          <NoveltiesTable
            items={result.items}
            showEmployee={false}
            canWrite={canWrite}
            canReport={canReport}
            types={types}
          />
        )}
        <Pagination
          page={result.page}
          pageCount={result.pageCount}
          total={result.total}
          pageSize={result.pageSize}
          params={query}
        />
      </Card>
    </>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/feedback/access-denied";
import { EmptyState } from "@/components/feedback/empty-state";
import { ListSkeleton } from "@/components/feedback/list-skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { Pagination } from "@/components/list/pagination";
import { PeriodNav } from "@/components/list/period-nav";
import { SearchInput } from "@/components/list/search-input";
import { Card } from "@/components/ui/card";
import { BulkNoveltyButtons } from "@/features/novelties/components/bulk-novelty-buttons";
import { GenerateNoveltiesDialog } from "@/features/novelties/components/generate-novelties-dialog";
import { NoveltiesTable } from "@/features/novelties/components/novelties-table";
import { NoveltyDialog } from "@/features/novelties/components/novelty-dialog";
import { NoveltyFilters } from "@/features/novelties/components/novelty-filters";
import { NoveltySummaryTiles } from "@/features/novelties/components/novelty-summary";
import { getDepartmentOptions, getEmployeeOptions, getTypeOptions, listNovelties } from "@/features/novelties/service";
import { periodEnd, todayInTimeZone, toIsoDate } from "@/lib/format";
import { hrefWith } from "@/lib/list/href";
import { flattenSearchParams } from "@/lib/list/query";
import { hasPermission } from "@/server/authz";
import { requirePageAccess } from "@/server/auth/request";

export const metadata: Metadata = { title: "Novedades" };

type Props = PageProps<"/novedades">;

export default function NoveltiesPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: Pick<Props, "searchParams">) {
  const access = await requirePageAccess("novelty:read", "novedades");
  if (!access.allowed) return <AccessDenied />;
  const { ctx } = access;
  const params = flattenSearchParams(await searchParams);
  const canWrite = hasPermission(ctx, "novelty:write");
  const canReport = hasPermission(ctx, "novelty:report");
  const [result, types, departments, employees] = await Promise.all([
    listNovelties(ctx, params),
    getTypeOptions(ctx),
    getDepartmentOptions(ctx),
    canWrite ? getEmployeeOptions(ctx) : Promise.resolve([]),
  ]);
  const { query, summary } = result;
  const today = todayInTimeZone();
  // Fecha sugerida: hoy si se está viendo el mes en curso; si no, el último día del período.
  const end = periodEnd(result.period);
  const defaultDate = toIsoDate(end < today ? end : today);
  const filtered = !!(query.q || query.tipo || query.origen || query.sector || query.estado !== "vigentes");
  const link = (periodo: string) => hrefWith("/novedades", params, { periodo });

  return (
    <>
      <PageHeader
        title="Novedades"
        description="Bandeja hacia la liquidación: se aprueban y se marcan como informadas cuando se cargan en el sistema de liquidación."
        actions={
          canWrite && (
            <>
              {result.canGenerate && <GenerateNoveltiesDialog period={query.periodo} label={result.label} />}
              <NoveltyDialog
                employeeId={null}
                employees={employees}
                types={types}
                defaultDate={defaultDate}
                defaultPeriod={query.periodo}
              />
            </>
          )
        }
      />
      <Card>
        <div className="flex flex-col gap-3 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <PeriodNav label={result.label} prevHref={link(result.prev)} nextHref={link(result.next)} />
            <BulkNoveltyButtons
              filter={{
                periodo: query.periodo,
                q: query.q,
                estado: query.estado,
                tipo: query.tipo,
                origen: query.origen,
                sector: query.sector,
              }}
              label={result.label}
              pending={summary.pending}
              approved={summary.approved}
              canWrite={canWrite}
              canReport={canReport}
            />
          </div>
          <SearchInput placeholder="Buscar por empleado o legajo" />
          <NoveltyFilters types={types} departments={departments} />
          {summary.pending + summary.approved + summary.reported + summary.annulled > 0 && (
            <NoveltySummaryTiles summary={summary} />
          )}
        </div>
        {result.items.length === 0 ? (
          <EmptyState
            title={filtered ? "No hay novedades que coincidan" : "No hay novedades en el período"}
            description={
              filtered
                ? "Probá con otra búsqueda o cambiá los filtros."
                : canWrite
                  ? 'Cargalas con "Nueva novedad" o armalas desde los otros módulos con "Generar novedades".'
                  : undefined
            }
          />
        ) : (
          <NoveltiesTable items={result.items} showEmployee canWrite={canWrite} canReport={canReport} types={types} />
        )}
        <Pagination
          page={result.page}
          pageCount={result.pageCount}
          total={result.total}
          pageSize={result.pageSize}
          params={{ ...params, periodo: query.periodo }}
        />
      </Card>
    </>
  );
}

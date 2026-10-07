import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/feedback/access-denied";
import { EmptyState } from "@/components/feedback/empty-state";
import { ListSkeleton } from "@/components/feedback/list-skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { Pagination } from "@/components/list/pagination";
import { SearchInput } from "@/components/list/search-input";
import { Card } from "@/components/ui/card";
import { ExitDialog } from "@/features/exits/components/exit-dialog";
import { ExitFilters } from "@/features/exits/components/exit-filters";
import { ExitsTable } from "@/features/exits/components/exits-table";
import { loadExitFormData } from "@/features/exits/page-data";
import { getEmployeeOptions, listExits } from "@/features/exits/service";
import { flattenSearchParams } from "@/lib/list/query";
import { requirePageAccess } from "@/server/auth/request";

export const metadata: Metadata = { title: "Egresos" };

type Props = PageProps<"/egresos">;

export default function ExitsPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: Pick<Props, "searchParams">) {
  const access = await requirePageAccess("exit:read", "egresos");
  if (!access.allowed) return <AccessDenied />;
  const { ctx } = access;
  const params = flattenSearchParams(await searchParams);
  const result = await listExits(ctx, params);
  const used = result.items.flatMap((i) => [i.type.id, i.reason.id]);
  const { options, edit } = await loadExitFormData(ctx, used);
  const employees = edit ? await getEmployeeOptions(ctx) : [];
  const { query, summary } = result;
  const filtered = !!(
    query.q ||
    query.tipo ||
    query.motivo ||
    query.desde ||
    query.hasta ||
    query.estado !== "vigentes"
  );

  return (
    <>
      <PageHeader
        title="Egresos"
        description="Bajas del personal. El legajo nunca se borra: al confirmar el egreso queda como egresado, con su historial."
        actions={
          edit && (
            <ExitDialog
              employeeId={null}
              employees={employees}
              types={edit.types}
              reasons={edit.reasons}
              today={edit.today}
            />
          )
        }
      />
      <Card>
        <div className="flex flex-col gap-3 p-3">
          <SearchInput placeholder="Buscar por empleado o legajo" />
          <ExitFilters types={options.types} reasons={options.reasons} />
          {summary.pending + summary.confirmed + summary.annulled > 0 && (
            <dl className="bg-border grid grid-cols-3 gap-px overflow-hidden rounded-md border">
              {[
                ["En trámite", summary.pending],
                ["Confirmados", summary.confirmed],
                ["Anulados", summary.annulled],
              ].map(([label, value]) => (
                <div key={label} className="bg-card px-3 py-2">
                  <dt className="text-muted-foreground text-xs">{label}</dt>
                  <dd className="text-lg font-semibold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        {result.items.length === 0 ? (
          <EmptyState
            title={filtered ? "No hay egresos que coincidan" : "No hay egresos registrados"}
            description={
              filtered
                ? "Probá con otra búsqueda o cambiá los filtros."
                : edit
                  ? 'Registralos con "Registrar egreso" o desde el historial de cada legajo.'
                  : undefined
            }
          />
        ) : (
          <ExitsTable items={result.items} showEmployee edit={edit} />
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

import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/feedback/access-denied";
import { EmptyState } from "@/components/feedback/empty-state";
import { ListSkeleton } from "@/components/feedback/list-skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { Pagination } from "@/components/list/pagination";
import { SearchInput } from "@/components/list/search-input";
import { Card } from "@/components/ui/card";
import { LeaveDialog } from "@/features/leaves/components/leave-dialog";
import { LeaveFilters } from "@/features/leaves/components/leave-filters";
import { LeavesTable } from "@/features/leaves/components/leaves-table";
import { loadLeaveFormData } from "@/features/leaves/page-data";
import { getEmployeeOptions, listLeaves } from "@/features/leaves/service";
import { VacationTabs } from "@/features/vacations/components/vacation-tabs";
import { flattenSearchParams } from "@/lib/list/query";
import { requirePageAccess } from "@/server/auth/request";

export const metadata: Metadata = { title: "Vacaciones" };

type Props = PageProps<"/vacaciones">;

export default function VacationsPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <VacationsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function VacationsContent({ searchParams }: Pick<Props, "searchParams">) {
  const access = await requirePageAccess("leave:read", "vacaciones");
  if (!access.allowed) return <AccessDenied />;
  const { ctx } = access;
  const params = flattenSearchParams(await searchParams);
  const [result, form] = await Promise.all([
    listLeaves(ctx, params, { onlyClass: "VACACIONES" }),
    loadLeaveFormData(ctx),
  ]);
  const employees = form.edit ? await getEmployeeOptions(ctx) : [];
  const vacationTypes = form.types.filter((t) => t.class === "VACACIONES");
  const edit = form.edit && { ...form.edit, types: form.edit.types.filter((t) => t.class === "VACACIONES") };
  const { query } = result;
  const filtered = !!(
    query.q ||
    query.leaveTypeId ||
    query.timing ||
    query.desde ||
    query.hasta ||
    query.status !== "vigentes"
  );

  return (
    <>
      <PageHeader
        title="Vacaciones"
        description="Solicitudes y aprobaciones de vacaciones. Los días se descuentan del saldo del período elegido."
        actions={
          edit && (
            <LeaveDialog
              employeeId={null}
              employees={employees}
              types={edit.types}
              canApprove={form.canApprove}
              defaultClass="VACACIONES"
            />
          )
        }
      />
      <VacationTabs current="/vacaciones" />
      <Card>
        <div className="flex flex-col gap-2 p-3">
          <SearchInput placeholder="Buscar por empleado o legajo" />
          <LeaveFilters types={vacationTypes} withClass={false} />
        </div>
        {result.items.length === 0 ? (
          <EmptyState
            title={filtered ? "No hay vacaciones que coincidan" : "Todavía no hay vacaciones cargadas"}
            description={filtered ? "Probá con otra búsqueda o cambiá los filtros." : undefined}
          />
        ) : (
          <LeavesTable items={result.items} showEmployee canApprove={form.canApprove} edit={edit} />
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

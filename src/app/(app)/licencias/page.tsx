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
import { flattenSearchParams } from "@/lib/list/query";
import { requirePageAccess } from "@/server/auth/request";

export const metadata: Metadata = { title: "Licencias y ausencias" };

type Props = PageProps<"/licencias">;

export default function LeavesPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <LeavesContent searchParams={searchParams} />
    </Suspense>
  );
}

async function LeavesContent({ searchParams }: Pick<Props, "searchParams">) {
  const access = await requirePageAccess("leave:read", "licencias");
  if (!access.allowed) return <AccessDenied />;
  const { ctx } = access;
  const params = flattenSearchParams(await searchParams);
  const [result, form] = await Promise.all([listLeaves(ctx, params), loadLeaveFormData(ctx)]);
  const employees = form.edit ? await getEmployeeOptions(ctx) : [];
  const { query } = result;
  const filtered = !!(
    query.q ||
    query.class ||
    query.leaveTypeId ||
    query.timing ||
    query.desde ||
    query.hasta ||
    query.status !== "vigentes"
  );

  return (
    <>
      <PageHeader
        title="Licencias y ausencias"
        description="Licencias, ausencias, vacaciones y suspensiones de todo el personal, con su aprobación."
        actions={
          form.edit && (
            <LeaveDialog employeeId={null} employees={employees} types={form.edit.types} canApprove={form.canApprove} />
          )
        }
      />
      <Card>
        <div className="flex flex-col gap-2 p-3">
          <SearchInput placeholder="Buscar por empleado o legajo" />
          <LeaveFilters types={form.types} withClass />
        </div>
        {result.items.length === 0 ? (
          <EmptyState
            title={filtered ? "No hay registros que coincidan" : "Todavía no hay licencias ni ausencias cargadas"}
            description={filtered ? "Probá con otra búsqueda o cambiá los filtros." : undefined}
          />
        ) : (
          <LeavesTable items={result.items} showEmployee canApprove={form.canApprove} edit={form.edit} />
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

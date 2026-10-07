import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/feedback/access-denied";
import { EmptyState } from "@/components/feedback/empty-state";
import { Pagination } from "@/components/list/pagination";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmployeeHeader } from "@/features/employees/components/employee-header";
import { loadEmployeePage } from "@/features/employees/page-data";
import { LeaveDialog } from "@/features/leaves/components/leave-dialog";
import { LeaveFilters } from "@/features/leaves/components/leave-filters";
import { LeavesTable } from "@/features/leaves/components/leaves-table";
import { loadLeaveFormData } from "@/features/leaves/page-data";
import { listLeaves } from "@/features/leaves/service";
import { BalancesTable } from "@/features/vacations/components/balances-table";
import { listEmployeeBalances } from "@/features/vacations/service";
import { flattenSearchParams } from "@/lib/list/query";

export const metadata: Metadata = { title: "Licencias y vacaciones del legajo" };

type Props = PageProps<"/empleados/[id]/licencias">;

export default function EmployeeLeavesPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Content params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ params, searchParams }: Props) {
  const page = await loadEmployeePage(params);
  if (!page.allowed || !page.canSeeLeaves) return <AccessDenied />;
  const { employee, ctx } = page;
  const query = flattenSearchParams(await searchParams);
  const [result, balances, form] = await Promise.all([
    listLeaves(ctx, query, { employeeId: employee.id }),
    listEmployeeBalances(ctx, employee.id),
    loadLeaveFormData(ctx),
  ]);
  const canRegister = !!form.edit && employee.status !== "EGRESADO";
  const filtered = !!(
    result.query.class ||
    result.query.leaveTypeId ||
    result.query.timing ||
    result.query.desde ||
    result.query.hasta ||
    result.query.status !== "vigentes"
  );

  return (
    <>
      <EmployeeHeader employee={employee} current="licencias" access={page} />
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Saldo de vacaciones</CardTitle>
          <CardDescription>Días de cada período anual. Los pendientes descuentan los días aprobados.</CardDescription>
        </CardHeader>
        {balances.length === 0 ? (
          <EmptyState
            title="Sin períodos de vacaciones"
            description="Se generan para todo el personal desde Vacaciones → Saldos por período."
          />
        ) : (
          <BalancesTable items={balances} showEmployee={false} canEdit={!!form.edit} />
        )}
      </Card>
      <Card>
        <div className="flex flex-col gap-2 p-3 lg:flex-row lg:items-start lg:justify-between">
          <LeaveFilters types={form.types} withClass withPeriod={false} />
          {canRegister && form.edit && (
            <LeaveDialog employeeId={employee.id} types={form.edit.types} canApprove={form.canApprove} />
          )}
        </div>
        {result.items.length === 0 ? (
          <EmptyState
            title={filtered ? "No hay registros que coincidan" : "Sin licencias, ausencias ni vacaciones"}
            description={
              filtered
                ? "Probá con otros filtros."
                : canRegister
                  ? 'Usá "Nuevo registro" para cargar el primero.'
                  : undefined
            }
          />
        ) : (
          <LeavesTable items={result.items} showEmployee={false} canApprove={form.canApprove} edit={form.edit} />
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

import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/feedback/access-denied";
import { EmptyState } from "@/components/feedback/empty-state";
import { ListSkeleton } from "@/components/feedback/list-skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { FilterSelect } from "@/components/list/filter-select";
import { Pagination } from "@/components/list/pagination";
import { PeriodNav } from "@/components/list/period-nav";
import { SearchInput } from "@/components/list/search-input";
import { Card } from "@/components/ui/card";
import { PayrollDialog } from "@/features/salaries/components/payroll-dialog";
import { PayrollTable } from "@/features/salaries/components/payroll-table";
import { PayrollTotals } from "@/features/salaries/components/payroll-totals";
import { SalaryDisclaimer } from "@/features/salaries/components/salary-disclaimer";
import { SalaryTabs } from "@/features/salaries/components/salary-tabs";
import { getConceptOptions, getDepartmentOptions, getEmployeeOptions, listPayrolls } from "@/features/salaries/service";
import { periodKey, periodOf, todayInTimeZone } from "@/lib/format";
import { hrefWith } from "@/lib/list/href";
import { flattenSearchParams } from "@/lib/list/query";
import { hasPermission } from "@/server/authz";
import { requirePageAccess } from "@/server/auth/request";

export const metadata: Metadata = { title: "Información salarial" };

type Props = PageProps<"/remuneraciones">;

export default function PayrollPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: Pick<Props, "searchParams">) {
  const access = await requirePageAccess("salary:read", "remuneraciones");
  if (!access.allowed) return <AccessDenied />;
  const { ctx } = access;
  const params = flattenSearchParams(await searchParams);
  const canEdit = hasPermission(ctx, "salary:write");
  const [result, departments, employees, concepts] = await Promise.all([
    listPayrolls(ctx, params),
    getDepartmentOptions(ctx),
    canEdit ? getEmployeeOptions(ctx) : Promise.resolve([]),
    canEdit ? getConceptOptions(ctx) : Promise.resolve([]),
  ]);
  const { query } = result;
  const maxPeriod = periodKey(periodOf(todayInTimeZone()));
  const filtered = !!(query.q || query.sector || query.revisar);
  const link = (periodo: string | null) => (periodo ? hrefWith("/remuneraciones", params, { periodo }) : null);

  return (
    <>
      <PageHeader
        title="Información salarial"
        description="Básicos pactados y resúmenes mensuales informados por el sistema de liquidación."
        actions={
          canEdit && (
            <PayrollDialog
              employeeId={null}
              employees={employees}
              concepts={concepts}
              defaultPeriod={query.periodo}
              maxPeriod={maxPeriod}
            />
          )
        }
      />
      <SalaryDisclaimer />
      <SalaryTabs current="/remuneraciones" />
      <Card>
        <div className="flex flex-col gap-3 p-3">
          <PeriodNav label={result.label} prevHref={link(result.prev)!} nextHref={link(result.next)} />
          <SearchInput placeholder="Buscar por empleado o legajo" />
          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
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
            <FilterSelect
              name="revisar"
              label="Diferencias"
              options={[
                { value: "", label: "Todos los resúmenes" },
                { value: "si", label: "Solo con diferencias" },
              ]}
            />
          </div>
          {result.totals.count > 0 && <PayrollTotals totals={result.totals} />}
        </div>
        {result.items.length === 0 ? (
          <EmptyState
            title={filtered ? "No hay resúmenes que coincidan" : "No hay resúmenes cargados en el período"}
            description={
              filtered
                ? "Probá con otra búsqueda o cambiá los filtros."
                : canEdit
                  ? 'Usá "Cargar resumen" con los datos del sistema de liquidación.'
                  : undefined
            }
          />
        ) : (
          <PayrollTable items={result.items} showEmployee canEdit={canEdit} concepts={concepts} maxPeriod={maxPeriod} />
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

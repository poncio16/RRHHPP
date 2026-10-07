import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/feedback/access-denied";
import { EmptyState } from "@/components/feedback/empty-state";
import { ListSkeleton } from "@/components/feedback/list-skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { FilterSelect } from "@/components/list/filter-select";
import { Pagination } from "@/components/list/pagination";
import { SearchInput } from "@/components/list/search-input";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { CurrentSalariesTable } from "@/features/salaries/components/current-salaries-table";
import { SalaryDisclaimer } from "@/features/salaries/components/salary-disclaimer";
import { SalaryTabs } from "@/features/salaries/components/salary-tabs";
import { getDepartmentOptions, listCurrentSalaries } from "@/features/salaries/service";
import { flattenSearchParams } from "@/lib/list/query";
import { requirePageAccess } from "@/server/auth/request";

export const metadata: Metadata = { title: "Básicos vigentes" };

type Props = PageProps<"/remuneraciones/basicos">;

export default function CurrentSalariesPage({ searchParams }: Props) {
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
  const [result, departments] = await Promise.all([listCurrentSalaries(ctx, params), getDepartmentOptions(ctx)]);
  const { query } = result;

  return (
    <>
      <PageHeader
        title="Información salarial"
        description="Básicos pactados y resúmenes mensuales informados por el sistema de liquidación."
      />
      <SalaryDisclaimer />
      <SalaryTabs current="/remuneraciones/basicos" />
      <Card>
        <div className="flex flex-col gap-3 p-3">
          {result.withoutSalary > 0 && query.estado !== "sin-basico" && (
            <Alert variant="warning" className="text-sm">
              {result.withoutSalary === 1
                ? "1 empleado en actividad no tiene básico cargado."
                : `${result.withoutSalary} empleados en actividad no tienen básico cargado.`}{" "}
              Se carga desde la pestaña Remuneraciones de cada legajo.
            </Alert>
          )}
          <SearchInput placeholder="Buscar por empleado o legajo" />
          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
            <FilterSelect
              name="estado"
              label="Empleados"
              defaultValue="activos"
              options={[
                { value: "activos", label: "En actividad" },
                { value: "sin-basico", label: "En actividad sin básico" },
                { value: "todos", label: "Todos, con egresados" },
              ]}
            />
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
        {result.items.length === 0 ? (
          <EmptyState
            title="No hay empleados que coincidan"
            description="Probá con otra búsqueda o cambiá los filtros."
          />
        ) : (
          <CurrentSalariesTable items={result.items} />
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

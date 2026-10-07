import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AccessDenied } from "@/components/feedback/access-denied";
import { EmptyState } from "@/components/feedback/empty-state";
import { ListSkeleton } from "@/components/feedback/list-skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { FilterSelect } from "@/components/list/filter-select";
import { Pagination } from "@/components/list/pagination";
import { SearchInput } from "@/components/list/search-input";
import { Card } from "@/components/ui/card";
import { BalancesTable } from "@/features/vacations/components/balances-table";
import { GenerateBalancesDialog } from "@/features/vacations/components/generate-balances-dialog";
import { VacationTabs } from "@/features/vacations/components/vacation-tabs";
import { getRules, listBalances } from "@/features/vacations/service";
import { todayInTimeZone } from "@/lib/format";
import { flattenSearchParams } from "@/lib/list/query";
import { hasPermission } from "@/server/authz";
import { requirePageAccess } from "@/server/auth/request";

export const metadata: Metadata = { title: "Saldos de vacaciones" };

type Props = PageProps<"/vacaciones/saldos">;

export default function BalancesPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <BalancesContent searchParams={searchParams} />
    </Suspense>
  );
}

async function BalancesContent({ searchParams }: Pick<Props, "searchParams">) {
  const access = await requirePageAccess("leave:read", "vacaciones");
  if (!access.allowed) return <AccessDenied />;
  const { ctx } = access;
  const params = flattenSearchParams(await searchParams);
  const [result, rules] = await Promise.all([listBalances(ctx, params), getRules(ctx)]);
  const canEdit = hasPermission(ctx, "leave:write");
  const thisYear = todayInTimeZone().getUTCFullYear();
  const yearOptions = [...new Set([thisYear + 1, thisYear, ...result.years, result.query.year])].sort((a, b) => b - a);
  const filtered = !!(result.query.q || result.query.saldo);

  return (
    <>
      <PageHeader
        title="Vacaciones"
        description="Días que corresponden en cada período anual, ajustes, usados y pendientes."
        actions={canEdit && <GenerateBalancesDialog years={yearOptions} defaultYear={result.query.year} />}
      />
      <VacationTabs current="/vacaciones/saldos" />
      <Card className="mb-4 p-4 text-sm">
        {rules.length === 0 ? (
          <p>
            Todavía no hay reglas de días por antigüedad.{" "}
            {hasPermission(ctx, "config:manage") ? (
              <Link href="/configuracion/vacaciones" className="text-primary hover:underline">
                Cargalas en Configuración
              </Link>
            ) : (
              "Pedile a un administrador que las cargue en Configuración"
            )}{" "}
            para poder generar los períodos.
          </p>
        ) : (
          <p className="text-muted-foreground">
            <span className="text-foreground font-medium">Reglas vigentes: </span>
            {rules.map((r) => `${r.label}: ${r.days} días`).join(" · ")}.{" "}
            {hasPermission(ctx, "config:manage") && (
              <Link href="/configuracion/vacaciones" className="text-primary hover:underline">
                Cambiar
              </Link>
            )}
          </p>
        )}
      </Card>
      <Card>
        <div className="flex flex-col gap-2 p-3 lg:flex-row lg:items-center">
          <SearchInput placeholder="Buscar por empleado o legajo" />
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <FilterSelect
              name="year"
              label="Período"
              defaultValue={String(result.query.year)}
              options={yearOptions.map((y) => ({ value: String(y), label: `Período ${y}` }))}
            />
            <FilterSelect
              name="saldo"
              label="Saldo"
              options={[
                { value: "", label: "Todos los saldos" },
                { value: "con-saldo", label: "Con días pendientes" },
                { value: "sin-saldo", label: "Sin días pendientes" },
              ]}
            />
          </div>
        </div>
        {result.items.length === 0 ? (
          <EmptyState
            title={
              filtered ? "No hay períodos que coincidan" : `Todavía no se generaron los períodos ${result.query.year}`
            }
            description={
              filtered
                ? "Probá con otra búsqueda o cambiá los filtros."
                : canEdit
                  ? 'Usá "Generar períodos" para calcularlos.'
                  : undefined
            }
          />
        ) : (
          <BalancesTable items={result.items} showEmployee canEdit={canEdit} />
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

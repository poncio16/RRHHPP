import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/feedback/access-denied";
import { EmptyState } from "@/components/feedback/empty-state";
import { ListSkeleton } from "@/components/feedback/list-skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { FilterSelect } from "@/components/list/filter-select";
import { Card } from "@/components/ui/card";
import { AlertList } from "@/features/alerts/components/alert-list";
import { ALERT_KIND_LABELS } from "@/features/alerts/constants";
import { listAlerts } from "@/features/alerts/service";
import { flattenSearchParams } from "@/lib/list/query";
import { hasPermission } from "@/server/authz";
import { requirePageAccess } from "@/server/auth/request";

export const metadata: Metadata = { title: "Alertas" };

type Props = PageProps<"/alertas">;

export default function AlertsPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: Pick<Props, "searchParams">) {
  const access = await requirePageAccess("employee:read", "alertas");
  if (!access.allowed) return <AccessDenied />;
  const { ctx } = access;
  const result = await listAlerts(ctx, flattenSearchParams(await searchParams));
  const { query, totals } = result;

  return (
    <>
      <PageHeader
        title="Alertas"
        description="Se calculan cada vez con los datos cargados. Posponer o descartar una alerta vale para todos los usuarios."
      />
      <Card>
        <div className="grid grid-cols-1 gap-2 border-b p-3 min-[420px]:grid-cols-2 sm:flex sm:flex-wrap">
          <FilterSelect
            name="estado"
            label="Estado"
            defaultValue="pendientes"
            options={[
              { value: "pendientes", label: `Pendientes (${totals.pendientes})` },
              { value: "pospuestas", label: `Pospuestas (${totals.pospuestas})` },
              { value: "descartadas", label: `Descartadas (${totals.descartadas})` },
            ]}
          />
          <FilterSelect
            name="tipo"
            label="Tipo"
            options={[
              { value: "", label: "Todos los tipos" },
              ...result.kinds.map((k) => ({
                value: k,
                label: `${ALERT_KIND_LABELS[k]}${query.estado === "pendientes" ? ` (${result.counts[k] ?? 0})` : ""}`,
              })),
            ]}
          />
        </div>
        {result.items.length === 0 ? (
          <EmptyState
            title={query.estado === "pendientes" ? "No hay alertas pendientes" : `No hay alertas ${query.estado}`}
            description={
              query.tipo
                ? "Probá con otro tipo."
                : hasPermission(ctx, "config:manage")
                  ? "La anticipación de cada aviso se ajusta en Configuración → Parámetros → Alertas."
                  : undefined
            }
          />
        ) : (
          <AlertList items={result.items} showKind={!query.tipo} actions />
        )}
      </Card>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AccessDenied } from "@/components/feedback/access-denied";
import { EmptyState } from "@/components/feedback/empty-state";
import { ListSkeleton } from "@/components/feedback/list-skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { Pagination } from "@/components/list/pagination";
import { SearchInput } from "@/components/list/search-input";
import { Card } from "@/components/ui/card";
import { AuditFilters } from "@/features/audit/components/audit-filters";
import { AuditTable } from "@/features/audit/components/audit-table";
import { getAuditFilterOptions, listAuditLog } from "@/features/audit/service";
import { ExportButtons } from "@/features/reports/components/export-buttons";
import { flattenSearchParams } from "@/lib/list/query";
import { hasPermission } from "@/server/authz";
import { requirePageAccess } from "@/server/auth/request";

export const metadata: Metadata = { title: "Auditoría" };

type Props = PageProps<"/auditoria">;

export default function AuditPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: Pick<Props, "searchParams">) {
  const access = await requirePageAccess("audit:read", "auditoria");
  if (!access.allowed) return <AccessDenied />;
  const { ctx } = access;
  const params = flattenSearchParams(await searchParams);
  const [result, options] = await Promise.all([listAuditLog(ctx, params), getAuditFilterOptions(ctx)]);
  const { query } = result;
  const filtered = !!(
    query.q ||
    query.desde ||
    query.hasta ||
    query.usuario ||
    query.modulo ||
    query.accion ||
    query.resultado ||
    query.entidad ||
    query.registro
  );
  const withoutEntity = new URLSearchParams(params);
  withoutEntity.delete("entidad");
  withoutEntity.delete("registro");
  withoutEntity.delete("page");

  return (
    <>
      <PageHeader
        title="Auditoría"
        description="Registro de altas, cambios, bajas, accesos, exportaciones e importaciones. No se puede modificar ni borrar."
        actions={hasPermission(ctx, "export:run") && <ExportButtons resource="auditoria" params={params} />}
      />
      <Card>
        <div className="flex flex-col gap-3 p-3">
          <SearchInput placeholder="Buscar en el detalle o el email" />
          <AuditFilters modules={options.modules} users={options.users} />
          {(query.entidad || query.registro) && (
            <p className="text-muted-foreground text-sm">
              Solo los eventos del registro {[query.entidad, query.registro].filter(Boolean).join(" ")}.{" "}
              <Link href={`/auditoria?${withoutEntity.toString()}`} className="text-primary hover:underline">
                Ver todos
              </Link>
            </p>
          )}
        </div>
        {result.items.length === 0 ? (
          <EmptyState
            title={filtered ? "No hay eventos que coincidan" : "Todavía no hay eventos"}
            description={filtered ? "Probá con otra búsqueda o cambiá los filtros." : undefined}
          />
        ) : (
          <AuditTable items={result.items} />
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

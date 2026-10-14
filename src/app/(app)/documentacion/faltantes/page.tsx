import { ChevronLeft } from "lucide-react";
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
import { MissingDocumentsTable } from "@/features/documents/components/missing-documents-table";
import { listMissingRequiredDocuments } from "@/features/documents/service";
import { flattenSearchParams } from "@/lib/list/query";
import { requirePageAccess } from "@/server/auth/request";

export const metadata: Metadata = { title: "Documentos obligatorios faltantes" };

type Props = PageProps<"/documentacion/faltantes">;

export default function MissingDocumentsPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: Pick<Props, "searchParams">) {
  const access = await requirePageAccess("document:read", "documentacion");
  if (!access.allowed) return <AccessDenied />;
  const params = flattenSearchParams(await searchParams);
  const result = await listMissingRequiredDocuments(access.ctx, params);
  const filtered = !!(result.query.q || result.query.documentTypeId);

  return (
    <>
      <Link
        href="/documentacion"
        className="text-muted-foreground hover:text-foreground mb-2 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden /> Documentación
      </Link>
      <PageHeader
        title="Documentos obligatorios faltantes"
        description="Legajos activos que no tienen cargado algún documento obligatorio. Los obligatorios se marcan en Configuración → Tipos de documento."
      />
      <Card>
        <div className="flex flex-col gap-2 p-3 lg:flex-row lg:items-center">
          <SearchInput placeholder="Buscar por empleado o legajo" />
          <FilterSelect
            name="documentTypeId"
            label="Documento"
            options={[
              { value: "", label: "Todos los obligatorios" },
              ...result.requiredTypes.map((t) => ({ value: t.id, label: t.name })),
            ]}
          />
        </div>
        {result.requiredTypes.length === 0 ? (
          <EmptyState
            title="No hay documentos obligatorios"
            description="Marcá en Configuración → Tipos de documento cuáles debe tener todo legajo."
          />
        ) : result.items.length === 0 ? (
          <EmptyState
            title={filtered ? "No hay legajos que coincidan" : "Todos los legajos activos tienen los obligatorios"}
            description={filtered ? "Probá con otra búsqueda o cambiá el filtro." : undefined}
          />
        ) : (
          <MissingDocumentsTable rows={result.items} />
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

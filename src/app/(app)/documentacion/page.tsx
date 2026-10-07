import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/feedback/access-denied";
import { EmptyState } from "@/components/feedback/empty-state";
import { ListSkeleton } from "@/components/feedback/list-skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { Pagination } from "@/components/list/pagination";
import { SearchInput } from "@/components/list/search-input";
import { Card } from "@/components/ui/card";
import { DocumentDialog } from "@/features/documents/components/document-dialog";
import { DocumentFilters } from "@/features/documents/components/document-filters";
import { DocumentsTable } from "@/features/documents/components/documents-table";
import { loadDocumentFormData } from "@/features/documents/page-data";
import { getEmployeeOptions, listDocuments } from "@/features/documents/service";
import { todayInTimeZone } from "@/lib/format";
import { flattenSearchParams } from "@/lib/list/query";
import { requirePageAccess } from "@/server/auth/request";

export const metadata: Metadata = { title: "Documentación" };

type Props = PageProps<"/documentacion">;

export default function DocumentsPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <DocumentsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function DocumentsContent({ searchParams }: Pick<Props, "searchParams">) {
  const access = await requirePageAccess("document:read", "documentacion");
  if (!access.allowed) return <AccessDenied />;
  const { ctx } = access;
  const params = flattenSearchParams(await searchParams);
  const [result, form] = await Promise.all([listDocuments(ctx, params), loadDocumentFormData(ctx)]);
  const employees = form.edit ? await getEmployeeOptions(ctx) : [];
  const filtered = !!(
    result.query.q ||
    result.query.documentTypeId ||
    result.query.expiry ||
    result.query.status !== "vigentes"
  );

  return (
    <>
      <PageHeader
        title="Documentación"
        description="Documentos de todos los legajos, con su estado y vencimiento."
        actions={
          form.edit && (
            <DocumentDialog employeeId={null} employees={employees} types={form.edit.types} limits={form.edit.limits} />
          )
        }
      />
      <Card>
        <div className="flex flex-col gap-2 p-3 lg:flex-row lg:items-center">
          <SearchInput placeholder="Buscar por empleado o legajo" />
          <DocumentFilters types={form.types} />
        </div>
        {result.items.length === 0 ? (
          <EmptyState
            title={filtered ? "No hay documentos que coincidan" : "Todavía no hay documentos cargados"}
            description={filtered ? "Probá con otra búsqueda o cambiá los filtros." : undefined}
          />
        ) : (
          <DocumentsTable items={result.items} today={todayInTimeZone()} showEmployee edit={form.edit} />
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

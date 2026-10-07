import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/feedback/access-denied";
import { EmptyState } from "@/components/feedback/empty-state";
import { Pagination } from "@/components/list/pagination";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DocumentDialog } from "@/features/documents/components/document-dialog";
import { DocumentFilters } from "@/features/documents/components/document-filters";
import { DocumentsTable } from "@/features/documents/components/documents-table";
import { loadDocumentFormData } from "@/features/documents/page-data";
import { listDocuments } from "@/features/documents/service";
import { EmployeeHeader } from "@/features/employees/components/employee-header";
import { loadEmployeePage } from "@/features/employees/page-data";
import { todayInTimeZone } from "@/lib/format";
import { flattenSearchParams } from "@/lib/list/query";

export const metadata: Metadata = { title: "Documentación del legajo" };

type Props = PageProps<"/empleados/[id]/documentacion">;

export default function EmployeeDocumentsPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Content params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ params, searchParams }: Props) {
  const page = await loadEmployeePage(params);
  if (!page.allowed || !page.canSeeDocuments) return <AccessDenied />;
  const { employee, ctx } = page;
  const query = flattenSearchParams(await searchParams);
  const [result, form] = await Promise.all([listDocuments(ctx, query, employee.id), loadDocumentFormData(ctx)]);
  const filtered = !!(result.query.documentTypeId || result.query.expiry || result.query.status !== "vigentes");

  return (
    <>
      <EmployeeHeader
        employee={employee}
        current="documentacion"
        canEdit={page.canEdit}
        canSeeBank={page.canSeeBank}
        canSeeDocuments
      />
      <Card>
        <div className="flex flex-col gap-2 p-3 lg:flex-row lg:items-center lg:justify-between">
          <DocumentFilters types={form.types} />
          {form.edit && employee.status !== "EGRESADO" && (
            <DocumentDialog employeeId={employee.id} types={form.edit.types} limits={form.edit.limits} />
          )}
        </div>
        {result.items.length === 0 ? (
          <EmptyState
            title={filtered ? "No hay documentos que coincidan" : "Todavía no hay documentos cargados"}
            description={
              filtered
                ? "Probá con otros filtros."
                : form.edit
                  ? 'Usá "Nuevo documento" para registrar el primero.'
                  : undefined
            }
          />
        ) : (
          <DocumentsTable items={result.items} today={todayInTimeZone()} showEmployee={false} edit={form.edit} />
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

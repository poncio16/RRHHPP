import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AccessDenied } from "@/components/feedback/access-denied";
import { ListSkeleton } from "@/components/feedback/list-skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { StatTile } from "@/features/dashboard/components/stat-tile";
import { JobActions } from "@/features/imports/components/job-actions";
import { RowsTable } from "@/features/imports/components/rows-table";
import { JOB_STATUS } from "@/features/imports/constants";
import { canImport, getImportJob } from "@/features/imports/service";
import { formatDateTime } from "@/lib/format";
import { requirePageAccess } from "@/server/auth/request";
import { NotFoundError } from "@/server/errors";
import { z } from "@/lib/zod";

export const metadata: Metadata = { title: "Vista previa de la importación" };

type Props = PageProps<"/importar/[id]">;

const FILTERS = { todas: "Todas", problemas: "Con problemas", validas: "Válidas" } as const;

export default function ImportJobPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Content params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ params, searchParams }: Props) {
  const access = await requirePageAccess("import:run", "importacion");
  if (!access.allowed || !canImport(access.ctx)) return <AccessDenied />;
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const job = await getImportJob(access.ctx, id.data).catch((error: unknown) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const raw = (await searchParams).filas;
  const filter = typeof raw === "string" && raw in FILTERS ? (raw as keyof typeof FILTERS) : "todas";
  const rows = job.rows.filter((row) =>
    filter === "todas"
      ? true
      : filter === "validas"
        ? row.status === "VALIDA" || row.status === "CREADA"
        : row.status === "ERROR" || row.status === "DUPLICADA",
  );
  const { summary } = job;
  const pending = job.status === "VALIDADO";

  return (
    <>
      <Link
        href="/importar"
        className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Importar
      </Link>
      <PageHeader
        title={pending ? "Vista previa de la importación" : "Importación"}
        description={`${job.fileName} · subido por ${job.createdBy.name} el ${formatDateTime(job.createdAt)}`}
        actions={<Badge variant={JOB_STATUS[job.status].variant}>{JOB_STATUS[job.status].label}</Badge>}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Filas leídas" value={job.totalRows} />
        {job.status === "CONFIRMADO" ? (
          <StatTile label="Legajos creados" value={summary.created} hint={`el ${formatDateTime(job.confirmedAt)}`} />
        ) : (
          <StatTile label="Válidas" value={summary.valid} hint={pending ? "se crean al confirmar" : "no se crearon"} />
        )}
        <StatTile label="Con errores" value={summary.errors} hint="no se importan" />
        <StatTile label="Duplicadas" value={summary.duplicates} hint="repetidas o ya cargadas; no se tocan" />
      </div>

      <div className="mb-6 flex flex-col gap-3">
        {job.ignoredColumns.length > 0 && (
          <Alert variant="warning">
            Estas columnas no son de la plantilla y se ignoran: {job.ignoredColumns.join(", ")}.
          </Alert>
        )}
        {pending && (
          <Alert variant={summary.valid === 0 ? "destructive" : "info"}>
            {summary.valid === 0
              ? "Ninguna fila es válida. Corregí el archivo y volvé a subirlo desde Importar."
              : summary.errors + summary.duplicates > 0
                ? "Podés importar solo las filas válidas, o descartar, corregir el archivo y volver a subirlo."
                : "Todas las filas son válidas. Revisalas y confirmá para crear los legajos."}
          </Alert>
        )}
        {job.status === "DESCARTADO" && <Alert variant="info">Se descartó sin crear legajos.</Alert>}
        {pending && <JobActions id={job.id} valid={summary.valid} skipped={summary.errors + summary.duplicates} />}
      </div>

      <Card>
        <nav aria-label="Filtrar filas" className="flex flex-wrap gap-1 border-b px-3 py-2">
          {Object.entries(FILTERS).map(([key, label]) => (
            <Link
              key={key}
              href={key === "todas" ? `/importar/${job.id}` : `/importar/${job.id}?filas=${key}`}
              aria-current={filter === key ? "page" : undefined}
              className="aria-[current=page]:bg-muted rounded-md px-3 py-1.5 text-sm font-medium"
            >
              {label}
            </Link>
          ))}
        </nav>
        {rows.length === 0 ? (
          <p className="text-muted-foreground px-5 py-8 text-center text-sm">No hay filas en esta vista.</p>
        ) : (
          <RowsTable rows={rows} />
        )}
      </Card>
    </>
  );
}

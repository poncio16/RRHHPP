import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AccessDenied } from "@/components/feedback/access-denied";
import { EmptyState } from "@/components/feedback/empty-state";
import { ListSkeleton } from "@/components/feedback/list-skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { IMPORT_MAX_BYTES, IMPORT_MAX_ROWS } from "@/features/imports/columns";
import { UploadForm } from "@/features/imports/components/upload-form";
import { JOB_STATUS } from "@/features/imports/constants";
import { canImport, listImportJobs } from "@/features/imports/service";
import { formatDateTime } from "@/lib/format";
import { requirePageAccess } from "@/server/auth/request";

export const metadata: Metadata = { title: "Importar empleados" };

export default function ImportPage() {
  return (
    <>
      <PageHeader
        title="Importar empleados"
        description="Alta de legajos nuevos desde Excel o CSV. Antes de crear nada se muestra una vista previa con los errores de cada fila."
        actions={
          <a href="/api/importar/plantilla" download className={buttonVariants({ variant: "outline" })}>
            <Download />
            Descargar plantilla
          </a>
        }
      />
      <Suspense fallback={<ListSkeleton />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  const access = await requirePageAccess("import:run", "importacion");
  if (!access.allowed || !canImport(access.ctx)) return <AccessDenied />;
  const jobs = await listImportJobs(access.ctx);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Subir archivo</CardTitle>
          <CardDescription>
            Completá la plantilla (una fila por empleado, sin cambiar los encabezados) y subila. Los catálogos se
            escriben por nombre, como figuran en la hoja Valores. Solo se crean legajos nuevos: si el DNI, el CUIL o el
            legajo ya existen, la fila queda como duplicada y no se modifica nada.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UploadForm maxMb={IMPORT_MAX_BYTES / 1024 / 1024} maxRows={IMPORT_MAX_ROWS} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Importaciones recientes</CardTitle>
        </CardHeader>
        {jobs.length === 0 ? (
          <EmptyState title="Todavía no hay importaciones" description="Las que subas van a aparecer acá." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Archivo</TableHead>
                <TableHead className="hidden md:table-cell">Subido</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Filas</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Válidas</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="align-top">
                    <Link href={`/importar/${job.id}`} className="text-primary font-medium break-all hover:underline">
                      {job.fileName}
                    </Link>
                    <span className="text-muted-foreground block text-xs md:hidden">
                      {formatDateTime(job.createdAt)} · {job.validRows} de {job.totalRows} válidas
                    </span>
                  </TableCell>
                  <TableCell className="hidden align-top md:table-cell">
                    {formatDateTime(job.createdAt)}
                    <span className="text-muted-foreground block text-xs">{job.createdBy.name}</span>
                  </TableCell>
                  <TableCell className="hidden text-right align-top tabular-nums sm:table-cell">
                    {job.totalRows}
                  </TableCell>
                  <TableCell className="hidden text-right align-top tabular-nums sm:table-cell">
                    {job.validRows}
                  </TableCell>
                  <TableCell className="align-top">
                    <Badge variant={JOB_STATUS[job.status].variant}>{JOB_STATUS[job.status].label}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

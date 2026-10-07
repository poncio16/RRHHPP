import { Download, Lock } from "lucide-react";
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { daysUntil } from "../expiry";
import { formatFileSize } from "../files";
import type { DocumentListItem } from "../service";
import { AnnulDocumentButton } from "./annul-document-button";
import { DocumentStatusBadge, ExpiryBadge } from "./document-badges";
import { DocumentDialog, type DocumentTypeChoice } from "./document-dialog";

function expiryHint(item: DocumentListItem, today: Date) {
  if (!item.expiryDate || item.status === "ANULADO") return null;
  const days = daysUntil(item.expiryDate, today);
  if (days < 0) return `Venció hace ${-days} ${days === -1 ? "día" : "días"}`;
  if (days === 0) return "Vence hoy";
  return `Faltan ${days} ${days === 1 ? "día" : "días"}`;
}

/** Tabla de documentos, del legajo o del listado general (`showEmployee`). */
export function DocumentsTable({
  items,
  today,
  showEmployee,
  edit,
}: {
  items: DocumentListItem[];
  today: Date;
  showEmployee: boolean;
  /** Presente solo si el usuario puede registrar documentación. */
  edit: { types: DocumentTypeChoice[]; limits: { maxFileSizeMb: number; typesLabel: string } } | null;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Documento</TableHead>
          {showEmployee && <TableHead className="hidden md:table-cell">Empleado</TableHead>}
          <TableHead className="hidden md:table-cell">Emisión</TableHead>
          <TableHead>Vencimiento</TableHead>
          <TableHead className="hidden sm:table-cell">Estado</TableHead>
          <TableHead className="text-right">
            <span className="sr-only">Acciones</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => {
          const title = `${item.documentType.name} de ${item.employee.lastName}, ${item.employee.firstName}`;
          const hint = expiryHint(item, today);
          return (
            <TableRow key={item.id} className={item.status === "ANULADO" ? "opacity-60" : undefined}>
              <TableCell className="align-top">
                <span className="flex items-center gap-1.5 font-medium">
                  {item.documentType.name}
                  {item.documentType.isSensitive && (
                    <Lock className="text-muted-foreground size-3.5" aria-label="Sensible" />
                  )}
                </span>
                {item.notes && (
                  <span className="text-muted-foreground line-clamp-2 block max-w-xs text-xs whitespace-pre-line">
                    {item.notes}
                  </span>
                )}
                {showEmployee && (
                  <Link
                    href={`/empleados/${item.employee.id}/documentacion`}
                    className="text-primary block text-sm hover:underline md:hidden"
                  >
                    {item.employee.lastName}, {item.employee.firstName}
                  </Link>
                )}
                <span className="mt-1 block sm:hidden">
                  <DocumentStatusBadge status={item.status} />
                </span>
              </TableCell>
              {showEmployee && (
                <TableCell className="hidden align-top md:table-cell">
                  <Link href={`/empleados/${item.employee.id}/documentacion`} className="text-primary hover:underline">
                    {item.employee.lastName}, {item.employee.firstName}
                  </Link>
                  <span className="text-muted-foreground block text-xs">Legajo {item.employee.fileNumber}</span>
                </TableCell>
              )}
              <TableCell className="hidden align-top whitespace-nowrap md:table-cell">
                {item.issueDate ? formatDate(item.issueDate) : <span className="text-muted-foreground">—</span>}
              </TableCell>
              <TableCell className="align-top whitespace-nowrap">
                {item.expiryDate ? formatDate(item.expiryDate) : <span className="text-muted-foreground">—</span>}
                <span className="mt-1 flex flex-wrap items-center gap-1">
                  <ExpiryBadge state={item.expiry} />
                </span>
                {hint && <span className="text-muted-foreground block text-xs whitespace-normal">{hint}</span>}
              </TableCell>
              <TableCell className="hidden align-top sm:table-cell">
                <DocumentStatusBadge status={item.status} />
              </TableCell>
              <TableCell className="align-top">
                <div className="flex flex-col items-end gap-1 sm:flex-row sm:justify-end">
                  {item.file && (
                    <a
                      href={`/api/documentos/${item.id}/archivo`}
                      className="hover:bg-accent inline-flex size-9 items-center justify-center rounded-md"
                      aria-label={`Descargar ${item.file.name}`}
                      title={`${item.file.name} (${formatFileSize(item.file.sizeBytes)})`}
                    >
                      <Download className="size-4" />
                    </a>
                  )}
                  {edit && item.status !== "ANULADO" && (
                    <>
                      <DocumentDialog
                        employeeId={item.employee.id}
                        types={edit.types}
                        limits={edit.limits}
                        document={{
                          id: item.id,
                          version: item.version,
                          title,
                          fileName: item.file?.name ?? null,
                          values: item.formValues,
                        }}
                      />
                      <AnnulDocumentButton id={item.id} version={item.version} title={title} />
                    </>
                  )}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

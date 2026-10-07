import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import type { ExitItem } from "../service";
import { ExitActions, type ExitEditOptions } from "./exit-actions";
import { ExitStatusBadge } from "./exit-badges";

/** Egresos de todo el personal (con empleado) o de un legajo. */
export function ExitsTable({
  items,
  showEmployee,
  edit,
}: {
  items: ExitItem[];
  showEmployee: boolean;
  edit: ExitEditOptions | null;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {showEmployee && <TableHead>Empleado</TableHead>}
          <TableHead>Egreso</TableHead>
          <TableHead className="hidden lg:table-cell">Observaciones</TableHead>
          <TableHead className="hidden md:table-cell">Estado</TableHead>
          {edit && (
            <TableHead className="text-right">
              <span className="sr-only">Acciones</span>
            </TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => {
          const name = `${item.employee.lastName}, ${item.employee.firstName}`;
          const title = `Egreso de ${name} del ${formatDate(item.exitDate)}`;
          return (
            <TableRow key={item.id}>
              {showEmployee && (
                <TableCell className="align-top">
                  <Link href={`/empleados/${item.employee.id}/historial`} className="text-primary hover:underline">
                    {name}
                  </Link>
                  <span className="text-muted-foreground block text-xs">Legajo {item.employee.fileNumber}</span>
                </TableCell>
              )}
              <TableCell className="align-top">
                <span className="font-medium">{formatDate(item.exitDate)}</span>
                <span className="block">{item.type.label}</span>
                <span className="text-muted-foreground block text-xs">Motivo: {item.reason.label}</span>
                {item.documents > 0 && (
                  <Link
                    href={`/empleados/${item.employee.id}/documentacion`}
                    className="text-primary block text-xs hover:underline"
                  >
                    {item.documents === 1 ? "1 documento" : `${item.documents} documentos`}
                  </Link>
                )}
                <span className="mt-1 block md:hidden">
                  <ExitStatusBadge status={item.status} />
                </span>
                {item.notes && (
                  <span className="text-muted-foreground mt-1 block text-xs whitespace-pre-line lg:hidden">
                    {item.notes}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground hidden align-top text-sm whitespace-pre-line lg:table-cell">
                {item.notes ?? "—"}
              </TableCell>
              <TableCell className="hidden align-top md:table-cell">
                <ExitStatusBadge status={item.status} />
                {item.confirmedBy && (
                  <span className="text-muted-foreground mt-1 block text-xs">Confirmó {item.confirmedBy}</span>
                )}
              </TableCell>
              {edit && (
                <TableCell className="align-top">
                  <ExitActions item={item} title={title} edit={edit} />
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

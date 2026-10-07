import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { BalanceItem } from "../service";
import { BalanceDialog } from "./balance-dialog";

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/** Saldos de vacaciones: corresponden, ajustes, usados, solicitados y pendientes. */
export function BalancesTable({
  items,
  showEmployee,
  canEdit,
}: {
  items: BalanceItem[];
  showEmployee: boolean;
  canEdit: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{showEmployee ? "Empleado" : "Período"}</TableHead>
          <TableHead className="hidden text-right sm:table-cell">Corresponden</TableHead>
          <TableHead className="hidden text-right md:table-cell">Ajuste</TableHead>
          <TableHead className="hidden text-right md:table-cell">Arrastre</TableHead>
          <TableHead className="text-right">Usados</TableHead>
          <TableHead className="hidden text-right sm:table-cell">Solicitados</TableHead>
          <TableHead className="text-right">Pendientes</TableHead>
          {canEdit && (
            <TableHead className="text-right">
              <span className="sr-only">Acciones</span>
            </TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => {
          const name = `${item.employee.lastName}, ${item.employee.firstName}`;
          return (
            <TableRow key={item.id}>
              <TableCell className="align-top">
                {showEmployee ? (
                  <>
                    <Link href={`/empleados/${item.employee.id}/licencias`} className="text-primary hover:underline">
                      {name}
                    </Link>
                    <span className="text-muted-foreground block text-xs">
                      Legajo {item.employee.fileNumber}
                      {item.employee.status === "EGRESADO" ? " · egresado" : ""}
                    </span>
                  </>
                ) : (
                  <span className="font-medium">{item.year}</span>
                )}
                {item.adjustmentReason && (
                  <span className="text-muted-foreground block max-w-xs text-xs">Ajuste: {item.adjustmentReason}</span>
                )}
                {item.notes && !showEmployee && (
                  <span className="text-muted-foreground line-clamp-2 block max-w-xs text-xs">{item.notes}</span>
                )}
              </TableCell>
              <TableCell className="hidden text-right align-top tabular-nums sm:table-cell">
                {item.entitledDays}
              </TableCell>
              <TableCell className="hidden text-right align-top tabular-nums md:table-cell">
                {item.adjustmentDays === 0 ? "—" : signed(item.adjustmentDays)}
              </TableCell>
              <TableCell className="hidden text-right align-top tabular-nums md:table-cell">
                {item.carriedOverDays === 0 ? "—" : item.carriedOverDays}
              </TableCell>
              <TableCell className="text-right align-top tabular-nums">{item.used}</TableCell>
              <TableCell className="hidden text-right align-top tabular-nums sm:table-cell">
                {item.requested === 0 ? "—" : item.requested}
              </TableCell>
              <TableCell className="text-right align-top font-medium tabular-nums">{item.pending}</TableCell>
              {canEdit && (
                <TableCell className="text-right align-top">
                  <BalanceDialog
                    balance={{
                      id: item.id,
                      version: item.version,
                      title: `Período ${item.year} de ${name}`,
                      entitledDays: item.entitledDays,
                      used: item.used,
                      values: item.formValues,
                    }}
                  />
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

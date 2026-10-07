import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import type { SalaryItem } from "../service";
import { SalaryChangeDialog } from "./salary-change-dialog";

/** Historial de básicos de un legajo, del más reciente al más antiguo. */
export function SalaryHistoryTable({
  employeeId,
  items,
  canEdit,
  today,
}: {
  employeeId: string;
  items: SalaryItem[];
  canEdit: boolean;
  today: string;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Rige desde</TableHead>
          <TableHead className="text-right">Sueldo básico</TableHead>
          <TableHead className="hidden text-right sm:table-cell">Variación</TableHead>
          <TableHead className="hidden md:table-cell">Observaciones</TableHead>
          <TableHead className="hidden lg:table-cell">Cargado por</TableHead>
          {canEdit && (
            <TableHead className="text-right">
              <span className="sr-only">Acciones</span>
            </TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="align-top whitespace-nowrap">{formatDate(item.effectiveDate)}</TableCell>
            <TableCell className="text-right align-top font-medium whitespace-nowrap tabular-nums">
              {formatMoney(item.basicSalary)}
              {item.variation && (
                <span className="text-muted-foreground block text-xs font-normal sm:hidden">{item.variation}</span>
              )}
            </TableCell>
            <TableCell className="text-muted-foreground hidden text-right align-top tabular-nums sm:table-cell">
              {item.variation ?? "—"}
            </TableCell>
            <TableCell className="text-muted-foreground hidden max-w-xs align-top text-sm md:table-cell">
              {item.notes ?? "—"}
            </TableCell>
            <TableCell className="text-muted-foreground hidden align-top text-sm lg:table-cell">
              {item.createdBy}
              <span className="block text-xs">{formatDateTime(item.createdAt)}</span>
            </TableCell>
            {canEdit && (
              <TableCell className="text-right align-top">
                <SalaryChangeDialog
                  employeeId={employeeId}
                  today={today}
                  record={{
                    id: item.id,
                    version: item.version,
                    title: `Básico desde el ${formatDate(item.effectiveDate)}`,
                    values: item.formValues,
                  }}
                />
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

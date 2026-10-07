import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatMoney } from "@/lib/format";
import type { CurrentSalaryItem } from "../service";

/** Un renglón por empleado con su básico vigente y la variación respecto del anterior. */
export function CurrentSalariesTable({ items }: { items: CurrentSalaryItem[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Empleado</TableHead>
          <TableHead className="hidden md:table-cell">Puesto y categoría</TableHead>
          <TableHead className="text-right">Básico vigente</TableHead>
          <TableHead className="hidden sm:table-cell">Rige desde</TableHead>
          <TableHead className="hidden text-right lg:table-cell">Variación</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map(({ employee, salary }) => (
          <TableRow key={employee.id}>
            <TableCell className="align-top">
              <Link href={`/empleados/${employee.id}/remuneraciones`} className="text-primary hover:underline">
                {employee.name}
              </Link>
              <span className="text-muted-foreground block text-xs">
                Legajo {employee.fileNumber} · {employee.department}
              </span>
              {employee.status === "EGRESADO" && (
                <Badge variant="muted" className="mt-1">
                  Egresado
                </Badge>
              )}
            </TableCell>
            <TableCell className="text-muted-foreground hidden align-top text-sm md:table-cell">
              {employee.position}
              {employee.category && <span className="block text-xs">{employee.category}</span>}
            </TableCell>
            <TableCell className="text-right align-top whitespace-nowrap tabular-nums">
              {salary ? (
                <>
                  <span className="font-medium">{formatMoney(salary.basicSalary)}</span>
                  <span className="text-muted-foreground block text-xs sm:hidden">
                    desde {formatDate(salary.effectiveDate)}
                  </span>
                </>
              ) : (
                <Badge variant="warning">Sin básico cargado</Badge>
              )}
            </TableCell>
            <TableCell className="hidden align-top whitespace-nowrap sm:table-cell">
              {salary ? formatDate(salary.effectiveDate) : "—"}
            </TableCell>
            <TableCell className="text-muted-foreground hidden text-right align-top tabular-nums lg:table-cell">
              {salary?.variation ?? "—"}
              {salary?.previous && <span className="block text-xs">Anterior {formatMoney(salary.previous)}</span>}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatAmount, formatMoney, formatPeriod } from "@/lib/format";
import { CONCEPT_NATURE_LABELS } from "../constants";
import type { ConceptOption, PayrollItem } from "../service";
import { PayrollDialog } from "./payroll-dialog";

/** Resúmenes informados: de un período (con empleado) o de un legajo (con período). */
export function PayrollTable({
  items,
  showEmployee,
  canEdit,
  concepts,
  maxPeriod,
}: {
  items: PayrollItem[];
  showEmployee: boolean;
  canEdit: boolean;
  concepts: ConceptOption[];
  maxPeriod: string;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{showEmployee ? "Empleado" : "Período"}</TableHead>
          <TableHead className="hidden text-right sm:table-cell">Bruto</TableHead>
          <TableHead className="hidden text-right sm:table-cell">Descuentos</TableHead>
          <TableHead className="text-right">Neto</TableHead>
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
          const title = `Resumen de ${name}, ${formatPeriod(item.period)}`;
          return (
            <TableRow key={item.id}>
              <TableCell className="align-top">
                {showEmployee ? (
                  <>
                    <Link
                      href={`/empleados/${item.employee.id}/remuneraciones`}
                      className="text-primary hover:underline"
                    >
                      {name}
                    </Link>
                    <span className="text-muted-foreground block text-xs">Legajo {item.employee.fileNumber}</span>
                  </>
                ) : (
                  <span className="font-medium first-letter:uppercase">{formatPeriod(item.period)}</span>
                )}
                <span className="text-muted-foreground block text-xs tabular-nums sm:hidden">
                  Bruto {formatMoney(item.grossReported)} · Descuentos {formatMoney(item.deductionsReported)}
                </span>
                {item.warnings.length > 0 && (
                  <Badge variant="warning" className="mt-1 gap-1" title={item.warnings.join(" ")}>
                    <AlertTriangle className="size-3" aria-hidden /> Revisar diferencias
                  </Badge>
                )}
                {item.warnings.length > 0 && <span className="sr-only">{item.warnings.join(" ")}</span>}
                {item.notes && (
                  <span className="text-muted-foreground mt-1 line-clamp-2 block max-w-xs text-xs">{item.notes}</span>
                )}
                {item.lines.length > 0 && (
                  <details className="mt-1 text-xs">
                    <summary className="text-primary cursor-pointer select-none">
                      {item.lines.length === 1 ? "Ver 1 concepto" : `Ver ${item.lines.length} conceptos`}
                    </summary>
                    <ul className="mt-1 flex max-w-md flex-col gap-0.5">
                      {item.lines.map((line) => (
                        <li key={line.id} className="flex justify-between gap-3">
                          <span>
                            {line.concept}
                            {line.description && <span className="text-muted-foreground"> · {line.description}</span>}
                            {line.quantity !== null && (
                              <span className="text-muted-foreground"> · {formatAmount(line.quantity)}</span>
                            )}
                            <span className="text-muted-foreground"> ({CONCEPT_NATURE_LABELS[line.nature]})</span>
                          </span>
                          <span className="tabular-nums">{formatMoney(line.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </TableCell>
              <TableCell className="hidden text-right align-top whitespace-nowrap tabular-nums sm:table-cell">
                {formatMoney(item.grossReported)}
              </TableCell>
              <TableCell className="hidden text-right align-top whitespace-nowrap tabular-nums sm:table-cell">
                {formatMoney(item.deductionsReported)}
              </TableCell>
              <TableCell className="text-right align-top font-medium whitespace-nowrap tabular-nums">
                {formatMoney(item.netReported)}
              </TableCell>
              {canEdit && (
                <TableCell className="text-right align-top">
                  <PayrollDialog
                    employeeId={item.employee.id}
                    concepts={concepts}
                    defaultPeriod={item.formValues.period}
                    maxPeriod={maxPeriod}
                    record={{ id: item.id, version: item.version, title, values: item.formValues }}
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

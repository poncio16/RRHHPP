import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatAmount, formatDate, formatMoney, formatPeriod } from "@/lib/format";
import { CONCEPT_NATURE_LABELS } from "@/features/salaries/constants";
import type { NoveltyItem, NoveltyTypeOption } from "../service";
import { NoveltyActions } from "./novelty-actions";
import { NoveltyStatusBadge } from "./novelty-badges";

const quantityText = (item: NoveltyItem) =>
  item.quantity === null
    ? null
    : `${formatAmount(item.quantity).replace(/,00$/, "")}${item.quantityUnit ? ` ${item.quantityUnit}` : ""}`;

/** Novedades de un período (con empleado) o de un legajo (con período). */
export function NoveltiesTable({
  items,
  showEmployee,
  canWrite,
  canReport,
  types,
}: {
  items: NoveltyItem[];
  showEmployee: boolean;
  canWrite: boolean;
  canReport: boolean;
  types: NoveltyTypeOption[];
}) {
  const withActions = canWrite || canReport;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{showEmployee ? "Empleado" : "Período"}</TableHead>
          <TableHead>Novedad</TableHead>
          <TableHead className="hidden text-right sm:table-cell">Cantidad</TableHead>
          <TableHead className="hidden text-right sm:table-cell">Importe</TableHead>
          <TableHead className="hidden md:table-cell">Estado</TableHead>
          {withActions && (
            <TableHead className="text-right">
              <span className="sr-only">Acciones</span>
            </TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => {
          const name = `${item.employee.lastName}, ${item.employee.firstName}`;
          const title = `${item.type.name} de ${name} del ${formatDate(item.date)}`;
          const quantity = quantityText(item);
          return (
            <TableRow key={item.id}>
              <TableCell className="align-top">
                {showEmployee ? (
                  <>
                    <Link href={`/empleados/${item.employee.id}/novedades`} className="text-primary hover:underline">
                      {name}
                    </Link>
                    <span className="text-muted-foreground block text-xs">Legajo {item.employee.fileNumber}</span>
                  </>
                ) : (
                  <span className="font-medium whitespace-nowrap first-letter:uppercase">
                    {formatPeriod(item.period)}
                  </span>
                )}
                <span className="mt-1 block md:hidden">
                  <NoveltyStatusBadge status={item.status} />
                </span>
              </TableCell>
              <TableCell className="align-top">
                <span className="font-medium">{item.type.name}</span>
                <span className="text-muted-foreground block text-xs">
                  {formatDate(item.date)} · {CONCEPT_NATURE_LABELS[item.type.nature]}
                </span>
                {(quantity || item.amount) && (
                  <span className="block text-xs tabular-nums sm:hidden">
                    {[quantity, item.amount ? formatMoney(item.amount) : null].filter(Boolean).join(" · ")}
                  </span>
                )}
                {item.source && (
                  <Badge variant="muted" className="mt-1">
                    Generada desde {item.source}
                  </Badge>
                )}
                {item.notes && (
                  <span className="text-muted-foreground mt-1 line-clamp-3 block max-w-sm text-xs whitespace-pre-line">
                    {item.notes}
                  </span>
                )}
                <span className="text-muted-foreground mt-1 block text-xs">Registró {item.createdBy}</span>
              </TableCell>
              <TableCell className="hidden text-right align-top whitespace-nowrap tabular-nums sm:table-cell">
                {quantity ?? "—"}
              </TableCell>
              <TableCell className="hidden text-right align-top whitespace-nowrap tabular-nums sm:table-cell">
                {item.amount ? formatMoney(item.amount) : "—"}
              </TableCell>
              <TableCell className="hidden align-top md:table-cell">
                <NoveltyStatusBadge status={item.status} />
              </TableCell>
              {withActions && (
                <TableCell className="align-top">
                  <NoveltyActions item={item} title={title} canWrite={canWrite} canReport={canReport} types={types} />
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

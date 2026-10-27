import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AccountItem } from "../service";

/** Un renglón por cuenta: ingresos, retiros y saldo. */
export function AccountsTable({ items }: { items: AccountItem[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Cuenta</TableHead>
          <TableHead className="hidden text-right md:table-cell">Ingresos</TableHead>
          <TableHead className="hidden text-right md:table-cell">Retiros</TableHead>
          <TableHead className="text-right">Saldo</TableHead>
          <TableHead className="hidden sm:table-cell">Último movimiento</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="align-top">
              <Link href={`/retiros/${item.id}`} className="text-primary font-medium hover:underline">
                {item.name}
              </Link>
              {item.employee ? (
                <span className="text-muted-foreground block text-xs">
                  {item.employee.name} · legajo {item.employee.fileNumber}
                  {item.employee.status === "EGRESADO" && " · egresado"}
                </span>
              ) : (
                <Badge variant="muted" className="mt-1">
                  Sin legajo
                </Badge>
              )}
            </TableCell>
            <TableCell className="hidden text-right align-top whitespace-nowrap tabular-nums md:table-cell">
              {formatMoney(item.credit)}
            </TableCell>
            <TableCell className="hidden text-right align-top whitespace-nowrap tabular-nums md:table-cell">
              {formatMoney(item.debit)}
            </TableCell>
            <TableCell
              className={cn(
                "text-right align-top font-medium whitespace-nowrap tabular-nums",
                Number(item.balance) < 0 && "text-destructive",
              )}
            >
              {formatMoney(item.balance)}
            </TableCell>
            <TableCell className="text-muted-foreground hidden align-top whitespace-nowrap sm:table-cell">
              {item.lastDate ? formatDate(item.lastDate) : "—"}
              <span className="block text-xs">{item.count === 1 ? "1 movimiento" : `${item.count} movimientos`}</span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

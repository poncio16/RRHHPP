import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { StatementRow } from "../service";
import { VoidEntryDialog } from "./void-entry-dialog";

const money = (value: string) => (Number(value) === 0 ? "" : formatMoney(value));

/**
 * Cuenta corriente: fecha, concepto, ingreso, retiro y saldo después de cada
 * movimiento. Un "Saldo al …" de la planilla no es un movimiento: fija el
 * saldo en ese valor y muestra la diferencia con el calculado.
 */
export function StatementTable({
  rows,
  opening,
  canEdit,
}: {
  rows: StatementRow[];
  /** Saldo anterior a la primera fecha del filtro, o null sin filtro. */
  opening: string | null;
  canEdit: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Fecha</TableHead>
          <TableHead>Concepto</TableHead>
          <TableHead className="text-right">Ingreso</TableHead>
          <TableHead className="text-right">Retiro</TableHead>
          <TableHead className="text-right">Saldo</TableHead>
          {canEdit && (
            <TableHead className="w-10">
              <span className="sr-only">Acciones</span>
            </TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {opening !== null && (
          <TableRow className="bg-muted/40">
            <TableCell />
            <TableCell className="text-muted-foreground">Saldo anterior</TableCell>
            <TableCell />
            <TableCell />
            <TableCell className={cn("text-right font-medium tabular-nums", Number(opening) < 0 && "text-destructive")}>
              {formatMoney(opening)}
            </TableCell>
            {canEdit && <TableCell />}
          </TableRow>
        )}
        {rows.map((row) => (
          <TableRow key={row.id} className={cn(row.voided && "text-muted-foreground", row.isBalance && "bg-muted/40")}>
            <TableCell className="align-top whitespace-nowrap">{formatDate(row.date)}</TableCell>
            <TableCell className="min-w-48 align-top">
              <span className={cn(row.voided && "line-through")}>{row.concept ?? ""}</span>
              {row.isBalance && !row.voided && (
                <span className="block text-xs">
                  <Badge variant="muted">Saldo según la planilla</Badge>
                  {row.adjustment !== null && Number(row.adjustment) !== 0 && (
                    <> Ajuste de {formatMoney(row.adjustment)} respecto del saldo calculado</>
                  )}
                </span>
              )}
              {row.voided && (
                <span className="block text-xs">
                  <Badge variant="muted">Anulado</Badge> {row.voidReason} ({row.voidedBy},{" "}
                  {row.voidedAt ? formatDateTime(row.voidedAt) : ""})
                </span>
              )}
              <span className="text-muted-foreground block text-xs">
                {row.origin ?? `Carga manual de ${row.createdBy}`}
              </span>
            </TableCell>
            <TableCell
              className={cn("text-right align-top whitespace-nowrap tabular-nums", row.voided && "line-through")}
            >
              {row.isBalance ? "" : money(row.credit)}
            </TableCell>
            <TableCell
              className={cn("text-right align-top whitespace-nowrap tabular-nums", row.voided && "line-through")}
            >
              {row.isBalance ? "" : money(row.debit)}
            </TableCell>
            <TableCell
              className={cn(
                "text-right align-top font-medium whitespace-nowrap tabular-nums",
                row.balance !== null && Number(row.balance) < 0 && "text-destructive",
              )}
            >
              {row.balance === null ? "" : formatMoney(row.balance)}
            </TableCell>
            {canEdit && (
              <TableCell className="align-top">
                {!row.voided && (
                  <VoidEntryDialog
                    entryId={row.id}
                    title={`${formatDate(row.date)} · ${formatMoney(Number(row.credit) > 0 ? row.credit : row.debit)}`}
                  />
                )}
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

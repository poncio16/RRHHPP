import { Download } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatDecimal, formatInteger, formatMoney, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Cell, Column, ReportTable } from "../table";

export function formatCell(value: Cell | undefined, type: Column["type"]): string {
  if (value === null || value === undefined) return "—";
  if (value instanceof Date) return formatDate(value);
  if (typeof value === "string") return value;
  switch (type) {
    case "money":
      return formatMoney(value);
    case "percent":
      return formatPercent(value);
    case "decimal":
      return Number.isInteger(value) ? formatInteger(value) : formatDecimal(value);
    default:
      return formatInteger(value);
  }
}

const numeric = (c: Column) => c.type !== undefined && c.type !== "text" && c.type !== "date";

/** Una tabla del reporte, con su total y, si corresponde, la descarga en CSV. */
export function ReportTableView({ table, csvHref }: { table: ReportTable; csvHref: string | null }) {
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 pb-3">
        <CardTitle>
          {table.title}{" "}
          <span className="text-muted-foreground font-normal tabular-nums">({formatInteger(table.rows.length)})</span>
        </CardTitle>
        {csvHref && table.rows.length > 0 && (
          <a href={csvHref} className={buttonVariants({ variant: "outline", size: "sm" })} download>
            <Download /> CSV
          </a>
        )}
      </CardHeader>
      {table.rows.length === 0 ? (
        <p className="text-muted-foreground px-5 pb-5 text-sm">{table.empty}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {table.columns.map((c) => (
                <TableHead key={c.key} className={cn(numeric(c) && "text-right")}>
                  {c.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {table.rows.map((row, i) => (
              <TableRow key={i}>
                {table.columns.map((c) => (
                  <TableCell
                    key={c.key}
                    className={cn(numeric(c) && "text-right tabular-nums", c.key !== "empleado" && "whitespace-nowrap")}
                  >
                    {c.key === "empleado" && row._href ? (
                      <Link href={row._href} className="text-primary hover:underline">
                        {formatCell(row[c.key], c.type)}
                      </Link>
                    ) : (
                      formatCell(row[c.key], c.type)
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {table.totals && (
              <TableRow className="bg-muted/50 font-medium">
                {table.columns.map((c) => (
                  <TableCell key={c.key} className={cn(numeric(c) && "text-right tabular-nums", "whitespace-nowrap")}>
                    {table.totals![c.key] === null || table.totals![c.key] === undefined
                      ? ""
                      : formatCell(table.totals![c.key], c.type)}
                  </TableCell>
                ))}
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

/** Botón de descarga de un archivo armado en el servidor. */
export function DownloadLink({ href, label, className }: { href: string; label: string; className?: string }) {
  return (
    <a href={href} className={buttonVariants({ variant: "outline", className })} download>
      <Download /> {label}
    </a>
  );
}

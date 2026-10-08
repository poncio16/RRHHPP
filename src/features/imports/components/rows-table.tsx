import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ROW_STATUS } from "../constants";
import type { ImportRow } from "../map";

/** Filas del archivo con su estado y lo que hay que corregir. */
export function RowsTable({ rows }: { rows: Omit<ImportRow, "input">[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16 text-right">Fila</TableHead>
          <TableHead>Empleado</TableHead>
          <TableHead className="hidden sm:table-cell">DNI</TableHead>
          <TableHead className="hidden text-right sm:table-cell">Legajo</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead className="hidden md:table-cell">Observaciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.rowNumber}>
            <TableCell className="text-right align-top tabular-nums">{row.rowNumber}</TableCell>
            <TableCell className="align-top">
              <span className="font-medium">{row.name}</span>
              <span className="text-muted-foreground block text-xs tabular-nums sm:hidden">
                DNI {row.dni || "—"}
                {row.fileNumber ? ` · Legajo ${row.fileNumber}` : ""}
              </span>
              <Problems errors={row.errors} className="mt-1 md:hidden" />
            </TableCell>
            <TableCell className="hidden align-top tabular-nums sm:table-cell">{row.dni || "—"}</TableCell>
            <TableCell className="hidden text-right align-top tabular-nums sm:table-cell">
              {row.fileNumber ?? "—"}
            </TableCell>
            <TableCell className="align-top">
              <Badge variant={ROW_STATUS[row.status].variant}>{ROW_STATUS[row.status].label}</Badge>
            </TableCell>
            <TableCell className="hidden align-top md:table-cell">
              <Problems errors={row.errors} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function Problems({ errors, className }: { errors: string[]; className?: string }) {
  if (errors.length === 0) return null;
  return (
    <ul className={`text-muted-foreground list-disc space-y-0.5 pl-4 text-xs ${className ?? ""}`}>
      {errors.map((error) => (
        <li key={error}>{error}</li>
      ))}
    </ul>
  );
}

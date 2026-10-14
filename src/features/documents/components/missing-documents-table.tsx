import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { MissingDocumentsRow } from "../service";

/** Legajos activos con documentos obligatorios sin cargar. */
export function MissingDocumentsTable({ rows }: { rows: MissingDocumentsRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Empleado</TableHead>
          <TableHead className="hidden md:table-cell">Sector</TableHead>
          <TableHead>Falta cargar</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.employee.id}>
            <TableCell className="align-top">
              <Link
                href={`/empleados/${row.employee.id}/documentacion`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {row.employee.lastName}, {row.employee.firstName}
              </Link>
              <p className="text-muted-foreground text-xs">Legajo {row.employee.fileNumber}</p>
            </TableCell>
            <TableCell className="hidden align-top md:table-cell">{row.department}</TableCell>
            <TableCell className="align-top">
              <ul className="flex flex-col gap-0.5">
                {row.missing.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

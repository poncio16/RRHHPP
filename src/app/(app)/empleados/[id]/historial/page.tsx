import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/feedback/access-denied";
import { EmptyState } from "@/components/feedback/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmployeeHeader } from "@/features/employees/components/employee-header";
import { CHANGE_TYPE_LABELS } from "@/features/employees/constants";
import { loadEmployeePage } from "@/features/employees/page-data";
import { getHistory } from "@/features/employees/service";
import { formatDate, formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Historial laboral" };

export default function HistoryPage({ params }: PageProps<"/empleados/[id]/historial">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: PageProps<"/empleados/[id]/historial">["params"] }) {
  const page = await loadEmployeePage(params);
  if (!page.allowed) return <AccessDenied />;
  const { employee } = page;
  const rows = await getHistory(page.ctx, employee.id);

  return (
    <>
      <EmployeeHeader employee={employee} current="historial" access={page} />
      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title="Sin cambios registrados"
            description="Acá aparecen los cambios de puesto, sector, categoría, convenio, contratación, jornada, horario, modalidad, establecimiento, superior y cuenta sueldo."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vigente desde</TableHead>
                <TableHead className="hidden sm:table-cell">Cambio</TableHead>
                <TableHead>Anterior → Nuevo</TableHead>
                <TableHead className="hidden lg:table-cell">Observaciones</TableHead>
                <TableHead className="hidden md:table-cell">Registrado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="align-top whitespace-nowrap">
                    {formatDate(row.effectiveDate)}
                    <span className="text-muted-foreground block text-xs sm:hidden">
                      {CHANGE_TYPE_LABELS[row.changeType]}
                    </span>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant="muted">{CHANGE_TYPE_LABELS[row.changeType]}</Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-muted-foreground">{row.oldValue ?? "—"}</span>
                    <span aria-hidden> → </span>
                    <span className="sr-only"> pasó a </span>
                    <span className="font-medium">{row.newValue ?? "—"}</span>
                    {row.notes && <span className="text-muted-foreground block text-xs lg:hidden">{row.notes}</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden lg:table-cell">{row.notes ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground hidden text-xs md:table-cell">
                    {formatDateTime(row.createdAt)}
                    <span className="block">{row.createdBy.name}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}

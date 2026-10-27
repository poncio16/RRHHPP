import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AccessDenied } from "@/components/feedback/access-denied";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmployeeHeader } from "@/features/employees/components/employee-header";
import { loadEmployeePage } from "@/features/employees/page-data";
import { getEmployeeAccounts } from "@/features/withdrawals/service";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Retiros del legajo" };

type Props = PageProps<"/empleados/[id]/retiros">;

export default function EmployeeWithdrawalsPage({ params }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: Pick<Props, "params">) {
  const page = await loadEmployeePage(params);
  if (!page.allowed || !page.canSeeSalary) return <AccessDenied />;
  const { employee, ctx } = page;
  const accounts = await getEmployeeAccounts(ctx, employee.id);

  return (
    <>
      <EmployeeHeader employee={employee} current="retiros" access={page} />
      <Card>
        <CardHeader>
          <CardTitle>Cuentas de retiros</CardTitle>
          <p className="text-muted-foreground text-sm">
            Las cuentas se vinculan al legajo desde Retiros. Si la persona reingresó, puede tener más de una.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {accounts.length === 0 ? (
            <EmptyState title="El legajo no tiene cuentas de retiros vinculadas" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cuenta</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Ingresos</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Retiros</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead className="hidden md:table-cell">Último movimiento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Link href={`/retiros/${a.id}`} className="text-primary font-medium hover:underline">
                        {a.name}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">
                      {formatMoney(a.credit)}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">
                      {formatMoney(a.debit)}
                    </TableCell>
                    <TableCell
                      className={cn("text-right font-medium tabular-nums", Number(a.balance) < 0 && "text-destructive")}
                    >
                      {formatMoney(a.balance)}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden md:table-cell">
                      {a.lastDate ? formatDate(a.lastDate) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

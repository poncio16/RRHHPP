import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/feedback/access-denied";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmployeeHeader } from "@/features/employees/components/employee-header";
import { loadEmployeePage } from "@/features/employees/page-data";
import { PayrollDialog } from "@/features/salaries/components/payroll-dialog";
import { PayrollTable } from "@/features/salaries/components/payroll-table";
import { SalaryChangeDialog } from "@/features/salaries/components/salary-change-dialog";
import { SalaryDisclaimer } from "@/features/salaries/components/salary-disclaimer";
import { SalaryHistoryTable } from "@/features/salaries/components/salary-history-table";
import { getConceptOptions, getEmployeePayrolls, getEmployeeSalaries } from "@/features/salaries/service";
import { addMonths, formatDate, formatMoney, periodKey, periodOf, todayInTimeZone, toIsoDate } from "@/lib/format";
import { hasPermission } from "@/server/authz";

export const metadata: Metadata = { title: "Remuneraciones del legajo" };

type Props = PageProps<"/empleados/[id]/remuneraciones">;

export default function EmployeeSalaryPage({ params }: Props) {
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
  const canEdit = hasPermission(ctx, "salary:write");
  const [salaries, payrolls, concepts] = await Promise.all([
    getEmployeeSalaries(ctx, employee.id),
    getEmployeePayrolls(ctx, employee.id),
    canEdit ? getConceptOptions(ctx, []) : Promise.resolve([]),
  ]);
  const today = todayInTimeZone();
  const maxPeriod = periodKey(periodOf(today));
  // Período sugerido: el mes siguiente al último cargado o, si no hay, el mes anterior.
  const suggested = payrolls[0]
    ? periodKey(addMonths(payrolls[0].period, 1))
    : periodKey(addMonths(periodOf(today), -1));
  const defaultPeriod = suggested > maxPeriod ? maxPeriod : suggested;
  const { current } = salaries;

  return (
    <>
      <EmployeeHeader employee={employee} current="remuneraciones" access={page} />
      <SalaryDisclaimer />
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>Sueldo básico</CardTitle>
              <p className="text-muted-foreground mt-1 text-sm">
                {current ? (
                  <>
                    Vigente: <span className="text-foreground font-semibold">{formatMoney(current.basicSalary)}</span>{" "}
                    desde el {formatDate(current.effectiveDate)}
                  </>
                ) : (
                  "Sin básico cargado."
                )}
              </p>
            </div>
            {canEdit && <SalaryChangeDialog employeeId={employee.id} today={toIsoDate(today)} />}
          </CardHeader>
          <CardContent className="p-0">
            {salaries.items.length === 0 ? (
              <EmptyState
                title="Todavía no hay básicos registrados"
                description={canEdit ? 'Usá "Registrar básico" con el sueldo pactado y desde cuándo rige.' : undefined}
              />
            ) : (
              <SalaryHistoryTable
                employeeId={employee.id}
                items={salaries.items}
                canEdit={canEdit}
                today={toIsoDate(today)}
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>Resúmenes informados</CardTitle>
              <p className="text-muted-foreground mt-1 text-sm">
                Bruto, descuentos y neto de cada mes, tal como los informó el sistema de liquidación.
              </p>
            </div>
            {canEdit && (
              <PayrollDialog
                employeeId={employee.id}
                concepts={concepts}
                defaultPeriod={defaultPeriod}
                maxPeriod={maxPeriod}
              />
            )}
          </CardHeader>
          <CardContent className="p-0">
            {payrolls.length === 0 ? (
              <EmptyState title="Todavía no hay resúmenes cargados" />
            ) : (
              <PayrollTable
                items={payrolls}
                showEmployee={false}
                canEdit={canEdit}
                concepts={concepts}
                maxPeriod={maxPeriod}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/feedback/access-denied";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BankAccountDialog } from "@/features/employees/components/bank-account-dialog";
import { EmployeeHeader } from "@/features/employees/components/employee-header";
import { loadEmployeePage } from "@/features/employees/page-data";
import { getBankAccount, getBankFormOptions } from "@/features/employees/service";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Datos bancarios" };

export default function BankPage({ params }: PageProps<"/empleados/[id]/bancarios">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: PageProps<"/empleados/[id]/bancarios">["params"] }) {
  const page = await loadEmployeePage(params);
  if (!page.allowed || !page.canSeeBank) return <AccessDenied />;
  const { employee, ctx } = page;
  const account = await getBankAccount(ctx, employee.id);
  const options = page.canEdit ? await getBankFormOptions(ctx, account?.accountTypeId) : null;
  const dialog = options && (
    <BankAccountDialog
      employeeId={employee.id}
      current={account ? { cbu: account.cbu, alias: account.alias, accountTypeId: account.accountTypeId } : null}
      accountTypes={options.accountTypes}
      banks={options.banks}
    />
  );

  return (
    <>
      <EmployeeHeader employee={employee} current="bancarios" canEdit={page.canEdit} canSeeBank />
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Cuenta sueldo</CardTitle>
          {account && dialog}
        </CardHeader>
        {account ? (
          <CardContent>
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <Item label="Banco" value={`${account.bank.name} (${account.bank.code})`} />
              <Item label="Tipo de cuenta" value={account.accountType.label} />
              <Item label="CBU" value={<span className="font-mono">{account.cbu}</span>} />
              <Item label="Alias" value={account.alias} />
              <Item label="Última modificación" value={formatDateTime(account.updatedAt)} />
            </dl>
          </CardContent>
        ) : (
          <EmptyState title="No hay una cuenta sueldo cargada" action={dialog} />
        )}
      </Card>
    </>
  );
}

function Item({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-0.5 text-sm">{value || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

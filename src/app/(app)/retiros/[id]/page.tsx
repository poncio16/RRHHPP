import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AccessDenied } from "@/components/feedback/access-denied";
import { EmptyState } from "@/components/feedback/empty-state";
import { DateFilter } from "@/components/list/date-filter";
import { FilterSelect } from "@/components/list/filter-select";
import { Pagination } from "@/components/list/pagination";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountTotals } from "@/features/withdrawals/components/account-totals";
import { EntryDialog } from "@/features/withdrawals/components/entry-dialog";
import { LinkEmployeeForm } from "@/features/withdrawals/components/link-employee-form";
import { StatementTable } from "@/features/withdrawals/components/statement-table";
import { canEditWithdrawals, getAccount, getEmployeeOptions, getStatement } from "@/features/withdrawals/service";
import { todayInTimeZone, toIsoDate } from "@/lib/format";
import { flattenSearchParams } from "@/lib/list/query";
import { z } from "@/lib/zod";
import { hasPermission } from "@/server/authz";
import { requirePageAccess } from "@/server/auth/request";
import { NotFoundError } from "@/server/errors";

export const metadata: Metadata = { title: "Cuenta de retiros" };

type Props = PageProps<"/retiros/[id]">;

export default function AccountPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Content params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ params, searchParams }: Props) {
  const access = await requirePageAccess("salary:read", "retiros");
  if (!access.allowed) return <AccessDenied />;
  const { ctx } = access;
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const account = await getAccount(ctx, id.data).catch((error: unknown) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const query = flattenSearchParams(await searchParams);
  const canEdit = canEditWithdrawals(ctx);
  const [statement, employees] = await Promise.all([
    getStatement(ctx, account.id, query),
    canEdit ? getEmployeeOptions(ctx) : Promise.resolve([]),
  ]);
  const filtered = !!(statement.query.desde || statement.query.hasta);

  return (
    <>
      <Link
        href="/retiros"
        className="text-muted-foreground hover:text-foreground mb-2 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden /> Retiros
      </Link>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{account.name}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {account.employee ? (
              hasPermission(ctx, "employee:read") ? (
                <Link href={`/empleados/${account.employee.id}`} className="text-primary hover:underline">
                  {account.employee.name} · legajo {account.employee.fileNumber}
                </Link>
              ) : (
                `${account.employee.name} · legajo ${account.employee.fileNumber}`
              )
            ) : (
              "Sin legajo vinculado"
            )}
          </p>
        </div>
        {canEdit && <EntryDialog accountId={account.id} today={toIsoDate(todayInTimeZone())} />}
      </div>
      <div className="flex flex-col gap-4">
        <AccountTotals
          tiles={[
            { label: filtered ? "Ingresos del período" : "Ingresos", value: statement.period.credit },
            { label: filtered ? "Retiros del período" : "Retiros", value: statement.period.debit },
            { label: "Saldo actual", value: statement.balance, balance: true },
          ]}
        />
        {canEdit && (
          <Card>
            <CardHeader>
              <CardTitle>Legajo</CardTitle>
              <p className="text-muted-foreground text-sm">
                Si la persona tiene legajo, vinculalo para ver la cuenta desde ahí. Un legajo puede tener varias cuentas
                (por ejemplo, la hoja nueva de un reingreso).
              </p>
            </CardHeader>
            <CardContent>
              <LinkEmployeeForm accountId={account.id} current={account.employee?.id ?? null} employees={employees} />
            </CardContent>
          </Card>
        )}
        <Card>
          <div className="flex flex-col gap-2 p-3 sm:flex-row sm:flex-wrap">
            <DateFilter name="desde" label="Desde" />
            <DateFilter name="hasta" label="Hasta" />
            {statement.voidedCount > 0 && (
              <FilterSelect
                name="anulados"
                label="Anulados"
                options={[
                  { value: "", label: "Sin los anulados" },
                  { value: "si", label: `Con los anulados (${statement.voidedCount})` },
                ]}
              />
            )}
          </div>
          {statement.rows.length === 0 ? (
            <EmptyState title={filtered ? "No hay movimientos entre esas fechas" : "La cuenta no tiene movimientos"} />
          ) : (
            <StatementTable rows={statement.rows} opening={statement.opening} canEdit={canEdit} />
          )}
          <Pagination
            page={statement.page}
            pageCount={statement.pageCount}
            total={statement.total}
            pageSize={statement.pageSize}
            params={query}
          />
        </Card>
      </div>
    </>
  );
}

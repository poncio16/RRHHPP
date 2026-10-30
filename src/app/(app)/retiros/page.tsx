import { FileUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AccessDenied } from "@/components/feedback/access-denied";
import { EmptyState } from "@/components/feedback/empty-state";
import { ListSkeleton } from "@/components/feedback/list-skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { FilterSelect } from "@/components/list/filter-select";
import { Pagination } from "@/components/list/pagination";
import { SearchInput } from "@/components/list/search-input";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AccountTotals } from "@/features/withdrawals/components/account-totals";
import { AccountsTable } from "@/features/withdrawals/components/accounts-table";
import { EntryDialog } from "@/features/withdrawals/components/entry-dialog";
import { canEditWithdrawals, getAccountOptions, listAccounts } from "@/features/withdrawals/service";
import { todayInTimeZone, toIsoDate } from "@/lib/format";
import { flattenSearchParams } from "@/lib/list/query";
import { requirePageAccess } from "@/server/auth/request";

export const metadata: Metadata = { title: "Retiros" };

type Props = PageProps<"/retiros">;

export default function WithdrawalsPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: Pick<Props, "searchParams">) {
  const access = await requirePageAccess("salary:read", "retiros");
  if (!access.allowed) return <AccessDenied />;
  const { ctx } = access;
  const params = flattenSearchParams(await searchParams);
  const canEdit = canEditWithdrawals(ctx);
  const [result, accounts] = await Promise.all([
    listAccounts(ctx, params),
    canEdit ? getAccountOptions(ctx) : Promise.resolve([]),
  ]);
  const { query } = result;
  const filtered = !!(query.q || query.saldo !== "todos" || query.legajo);

  return (
    <>
      <PageHeader
        title="Retiros"
        description="Cuenta corriente de cada persona: ingresos, retiros y saldo. Cada hoja de las planillas es una cuenta."
        actions={
          canEdit && (
            <>
              {accounts.length > 0 && <EntryDialog accounts={accounts} today={toIsoDate(todayInTimeZone())} />}
              <Link href="/retiros/importar" className={buttonVariants()}>
                <FileUp /> Importar planillas
              </Link>
            </>
          )
        }
      />
      <Card>
        <div className="flex flex-col gap-3 p-3">
          <SearchInput placeholder="Buscar por cuenta, empleado o legajo" />
          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
            <FilterSelect
              name="saldo"
              label="Saldo"
              options={[
                { value: "", label: "Todos los saldos" },
                { value: "positivo", label: "Saldo positivo" },
                { value: "negativo", label: "Saldo negativo" },
              ]}
            />
            <FilterSelect
              name="legajo"
              label="Legajo"
              options={[
                { value: "", label: "Con y sin legajo" },
                { value: "con", label: "Vinculadas a un legajo" },
                { value: "sin", label: "Sin legajo" },
              ]}
            />
          </div>
          {result.total > 0 && (
            <AccountTotals
              tiles={[
                { label: "Ingresos", value: result.totals.credit },
                { label: "Retiros", value: result.totals.debit },
                { label: "Saldo", value: result.totals.balance, balance: true },
              ]}
            />
          )}
        </div>
        {result.items.length === 0 ? (
          <EmptyState
            title={filtered ? "No hay cuentas que coincidan" : "Todavía no hay cuentas"}
            description={
              filtered
                ? "Probá con otra búsqueda o cambiá los filtros."
                : canEdit
                  ? 'Usá "Importar planillas": cada hoja crea su cuenta.'
                  : undefined
            }
          />
        ) : (
          <AccountsTable items={result.items} />
        )}
        <Pagination
          page={result.page}
          pageCount={result.pageCount}
          total={result.total}
          pageSize={result.pageSize}
          params={params}
        />
      </Card>
    </>
  );
}

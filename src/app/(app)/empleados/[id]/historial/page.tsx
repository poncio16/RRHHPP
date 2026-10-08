import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/feedback/access-denied";
import { EmptyState } from "@/components/feedback/empty-state";
import { FilterSelect } from "@/components/list/filter-select";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmployeeHeader } from "@/features/employees/components/employee-header";
import { EmployeeTimeline } from "@/features/employees/components/employee-timeline";
import { loadEmployeePage } from "@/features/employees/page-data";
import { getTimeline } from "@/features/employees/service";
import { ExitDialog } from "@/features/exits/components/exit-dialog";
import { ExitsTable } from "@/features/exits/components/exits-table";
import { RehireDialog } from "@/features/exits/components/rehire-dialog";
import { loadExitFormData } from "@/features/exits/page-data";
import { listEmployeeExits } from "@/features/exits/service";
import { formatDate, toIsoDate } from "@/lib/format";
import { flattenSearchParams } from "@/lib/list/query";
import { hasPermission } from "@/server/authz";
import Link from "next/link";

export const metadata: Metadata = { title: "Historial" };

type Props = PageProps<"/empleados/[id]/historial">;

export default function HistoryPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Content params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ params, searchParams }: Props) {
  const page = await loadEmployeePage(params);
  if (!page.allowed) return <AccessDenied />;
  const { employee, ctx } = page;
  const [timeline, exits] = await Promise.all([
    getTimeline(ctx, employee.id, flattenSearchParams(await searchParams)),
    page.canSeeExits ? listEmployeeExits(ctx, employee.id) : Promise.resolve([]),
  ]);
  const exitForm = page.canSeeExits
    ? await loadExitFormData(
        ctx,
        exits.flatMap((e) => [e.type.id, e.reason.id]),
      )
    : null;
  const edit = exitForm?.edit ?? null;
  const active = employee.status === "ACTIVO";
  const name = `${employee.lastName}, ${employee.firstName}`;

  const actions =
    edit &&
    (active
      ? !page.pendingExit && (
          <ExitDialog
            employeeId={employee.id}
            types={edit.types}
            reasons={edit.reasons}
            today={edit.today}
            triggerVariant="outline"
          />
        )
      : employee.labor.exitDate && (
          <RehireDialog
            employeeId={employee.id}
            name={name}
            version={employee.version}
            lastExit={formatDate(employee.labor.exitDate)}
            currentSeniority={toIsoDate(employee.labor.seniorityDate)}
            today={edit.today}
          />
        ));

  const filters = [
    { value: "todos", label: "Todo el historial" },
    { value: "laborales", label: "Ingresos y cambios laborales" },
    ...(timeline.sources.salary ? [{ value: "salariales", label: "Básicos" }] : []),
    ...(timeline.sources.leaves ? [{ value: "licencias", label: "Licencias, ausencias y suspensiones" }] : []),
    ...(timeline.sources.exits ? [{ value: "egresos", label: "Ingresos y egresos" }] : []),
  ];

  return (
    <>
      <EmployeeHeader employee={employee} current="historial" access={page} actions={actions || undefined} />
      {exits.length > 0 && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Egresos</CardTitle>
          </CardHeader>
          <ExitsTable items={exits} showEmployee={false} edit={edit} />
        </Card>
      )}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
          <h2 className="font-semibold">Línea de tiempo</h2>
          <div className="flex flex-wrap items-center gap-3">
            {hasPermission(ctx, "audit:read") && (
              <Link
                href={`/auditoria?entidad=Employee&registro=${employee.id}`}
                className="text-primary text-sm hover:underline"
              >
                Cambios del legajo en auditoría
              </Link>
            )}
            <FilterSelect name="tipo" label="Qué mostrar" defaultValue="todos" options={filters} />
          </div>
        </div>
        {timeline.events.length === 0 ? (
          <EmptyState title="Sin hechos para mostrar" description="Probá con otro filtro." />
        ) : (
          <EmployeeTimeline events={timeline.events} />
        )}
      </Card>
    </>
  );
}

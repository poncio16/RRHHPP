import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AccessDenied } from "@/components/feedback/access-denied";
import { EmptyState } from "@/components/feedback/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AttendanceDialog } from "@/features/attendance/components/attendance-dialog";
import { AttendanceSummaryTiles } from "@/features/attendance/components/attendance-summary";
import { AttendanceTable } from "@/features/attendance/components/attendance-table";
import { getEmployeeMonth } from "@/features/attendance/service";
import { EmployeeHeader } from "@/features/employees/components/employee-header";
import { loadEmployeePage } from "@/features/employees/page-data";
import { todayInTimeZone, toIsoDate } from "@/lib/format";
import { flattenSearchParams } from "@/lib/list/query";
import { hasPermission } from "@/server/authz";

export const metadata: Metadata = { title: "Asistencia del legajo" };

type Props = PageProps<"/empleados/[id]/asistencia">;

export default function EmployeeAttendancePage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Content params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ params, searchParams }: Props) {
  const page = await loadEmployeePage(params);
  if (!page.allowed || !page.canSeeAttendance) return <AccessDenied />;
  const { employee, ctx } = page;
  const month = await getEmployeeMonth(ctx, employee.id, flattenSearchParams(await searchParams));
  const canEdit = hasPermission(ctx, "attendance:write");
  const today = toIsoDate(todayInTimeZone());
  const base = `/empleados/${employee.id}/asistencia`;

  return (
    <>
      <EmployeeHeader employee={employee} current="asistencia" access={page} />
      <Card>
        <div className="flex flex-col gap-3 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Link
                href={`${base}?mes=${month.prev}`}
                className={buttonVariants({ variant: "outline", size: "icon" })}
                aria-label="Mes anterior"
              >
                <ChevronLeft />
              </Link>
              <p className="min-w-40 text-center font-medium first-letter:uppercase">{month.label}</p>
              {month.next ? (
                <Link
                  href={`${base}?mes=${month.next}`}
                  className={buttonVariants({ variant: "outline", size: "icon" })}
                  aria-label="Mes siguiente"
                >
                  <ChevronRight />
                </Link>
              ) : (
                <span
                  className={buttonVariants({
                    variant: "outline",
                    size: "icon",
                    className: "pointer-events-none opacity-50",
                  })}
                  aria-hidden
                >
                  <ChevronRight />
                </span>
              )}
            </div>
            {canEdit && <AttendanceDialog employeeId={employee.id} today={today} />}
          </div>
          {month.items.length > 0 && <AttendanceSummaryTiles summary={month.summary} />}
        </div>
        {month.items.length === 0 ? (
          <EmptyState
            title="Sin asistencia cargada en el mes"
            description={canEdit ? 'Usá "Registrar día" o la planilla diaria de Asistencia.' : undefined}
          />
        ) : (
          <AttendanceTable items={month.items} showEmployee={false} canEdit={canEdit} today={today} />
        )}
      </Card>
    </>
  );
}

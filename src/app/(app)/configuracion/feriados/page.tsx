import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/feedback/access-denied";
import { EmptyState } from "@/components/feedback/empty-state";
import { ListSkeleton } from "@/components/feedback/list-skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { FilterSelect } from "@/components/list/filter-select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfigTabs } from "@/features/configuration/config-tabs";
import { DeleteHolidayButton } from "@/features/holidays/components/delete-holiday-button";
import { HolidayDialog } from "@/features/holidays/components/holiday-dialog";
import { listHolidays } from "@/features/holidays/service";
import { formatDate, toIsoDate } from "@/lib/format";
import { flattenSearchParams } from "@/lib/list/query";
import { requirePageAccess } from "@/server/auth/request";

export const metadata: Metadata = { title: "Feriados" };

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

type Props = PageProps<"/configuracion/feriados">;

export default function HolidaysPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <HolidaysContent searchParams={searchParams} />
    </Suspense>
  );
}

async function HolidaysContent({ searchParams }: Pick<Props, "searchParams">) {
  const access = await requirePageAccess("config:catalogs", "configuracion");
  if (!access.allowed) return <AccessDenied />;
  const result = await listHolidays(access.ctx, flattenSearchParams(await searchParams));

  return (
    <>
      <PageHeader
        title="Configuración"
        description="Catálogos y parámetros que usan los legajos y el resto de los módulos."
        actions={<HolidayDialog />}
      />
      <ConfigTabs current="/configuracion/feriados" permissions={access.ctx.permissions} />
      <Card>
        <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground text-sm">
            Cargá los feriados nacionales y locales de cada año según el calendario oficial.
          </p>
          <FilterSelect
            name="year"
            label="Año"
            defaultValue={String(result.year)}
            options={result.years.map((y) => ({ value: String(y), label: String(y) }))}
          />
        </div>
        {result.items.length === 0 ? (
          <EmptyState
            title={`No hay feriados cargados para ${result.year}`}
            description='Usá "Nuevo feriado" para agregarlos.'
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead className="hidden sm:table-cell">Tipo</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.map((holiday) => (
                <TableRow key={holiday.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(holiday.date)}
                    <span className="text-muted-foreground block text-xs">{WEEKDAYS[holiday.date.getUTCDay()]}</span>
                  </TableCell>
                  <TableCell>{holiday.name}</TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant={holiday.isNonWorkingOptional ? "muted" : "default"}>
                      {holiday.isNonWorkingOptional ? "No laborable" : "Feriado"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <HolidayDialog
                        holiday={{
                          id: holiday.id,
                          date: toIsoDate(holiday.date),
                          name: holiday.name,
                          isNonWorkingOptional: holiday.isNonWorkingOptional,
                        }}
                      />
                      <DeleteHolidayButton id={holiday.id} label={holiday.name} />
                    </div>
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

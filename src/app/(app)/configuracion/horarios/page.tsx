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
import { ScheduleActiveToggle } from "@/features/schedules/components/schedule-active-toggle";
import { ScheduleDialog } from "@/features/schedules/components/schedule-dialog";
import { getModalityOptions, listSchedules } from "@/features/schedules/service";
import { flattenSearchParams } from "@/lib/list/query";
import { requirePageAccess } from "@/server/auth/request";

export const metadata: Metadata = { title: "Horarios" };

type Props = PageProps<"/configuracion/horarios">;

export default function SchedulesPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <SchedulesContent searchParams={searchParams} />
    </Suspense>
  );
}

async function SchedulesContent({ searchParams }: Pick<Props, "searchParams">) {
  const access = await requirePageAccess("config:catalogs", "configuracion");
  if (!access.allowed) return <AccessDenied />;
  const { status } = flattenSearchParams(await searchParams);
  const result = await listSchedules(access.ctx, status);
  const assigned = result.items.map((s) => s.formValues.workModalityId).filter(Boolean);
  const modalities = await getModalityOptions(access.ctx, assigned);
  const activeModalities = modalities.filter((m) => m.isActive);

  return (
    <>
      <PageHeader
        title="Configuración"
        description="Catálogos y parámetros que usan los legajos y el resto de los módulos."
        actions={<ScheduleDialog modalities={activeModalities} />}
      />
      <ConfigTabs current="/configuracion/horarios" permissions={access.ctx.permissions} />
      <Card>
        <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground text-sm">Horarios y turnos semanales que se asignan a cada empleado.</p>
          <FilterSelect
            name="status"
            label="Estado"
            defaultValue="activos"
            options={[
              { value: "activos", label: "Activos" },
              { value: "inactivos", label: "Inactivos" },
              { value: "todos", label: "Todos" },
            ]}
          />
        </div>
        {result.items.length === 0 ? (
          <EmptyState
            title={result.status === "activos" ? "Todavía no hay horarios" : "No hay resultados"}
            description={
              result.status === "activos" ? 'Usá "Nuevo horario" para cargar el primero.' : "Cambiá el filtro."
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Horario</TableHead>
                <TableHead className="hidden md:table-cell">Días</TableHead>
                <TableHead className="hidden sm:table-cell">Horas semanales</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.map((schedule) => (
                <TableRow key={schedule.id}>
                  <TableCell>
                    <span className="font-medium">{schedule.name}</span>
                    {schedule.modality && (
                      <span className="text-muted-foreground block text-xs">{schedule.modality}</span>
                    )}
                    <span className="text-muted-foreground block text-xs md:hidden">{schedule.summary}</span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{schedule.summary}</TableCell>
                  <TableCell className="hidden sm:table-cell">{schedule.weeklyHours.replace(".", ",")}</TableCell>
                  <TableCell>
                    <Badge variant={schedule.isActive ? "success" : "muted"}>
                      {schedule.isActive ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <ScheduleDialog
                        schedule={{ id: schedule.id, values: schedule.formValues }}
                        modalities={modalities}
                      />
                      <ScheduleActiveToggle id={schedule.id} name={schedule.name} isActive={schedule.isActive} />
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

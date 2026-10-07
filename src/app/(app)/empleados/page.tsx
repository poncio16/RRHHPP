import { Plus } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { STATUS_LABELS } from "@/features/employees/constants";
import { getEmployeeListFilters, listEmployees } from "@/features/employees/service";
import { formatDate } from "@/lib/format";
import { flattenSearchParams } from "@/lib/list/query";
import { hasPermission } from "@/server/authz";
import { requirePageAccess } from "@/server/auth/request";

export const metadata: Metadata = { title: "Empleados" };

type Props = PageProps<"/empleados">;

export default function EmployeesPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <EmployeesContent searchParams={searchParams} />
    </Suspense>
  );
}

async function EmployeesContent({ searchParams }: Pick<Props, "searchParams">) {
  const access = await requirePageAccess("employee:read", "empleados");
  if (!access.allowed) return <AccessDenied />;
  const { ctx } = access;
  const params = flattenSearchParams(await searchParams);
  const [result, filters] = await Promise.all([listEmployees(ctx, params), getEmployeeListFilters(ctx)]);
  const canSeePersonal = hasPermission(ctx, "employee.personal:read");
  const canCreate = hasPermission(ctx, "employee:write") && canSeePersonal;
  const filtered = !!(result.query.q || result.query.departmentId || result.query.workplaceId);

  return (
    <>
      <PageHeader
        title="Empleados"
        description="Legajos del personal: datos personales, laborales e historial."
        actions={
          canCreate && (
            <Link href="/empleados/nuevo" className={buttonVariants()}>
              <Plus /> Nuevo empleado
            </Link>
          )
        }
      />
      <Card>
        <div className="flex flex-col gap-2 p-3 lg:flex-row lg:items-center">
          <SearchInput
            placeholder={canSeePersonal ? "Buscar por nombre, legajo, DNI o CUIL" : "Buscar por nombre o legajo"}
          />
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <FilterSelect
              name="status"
              label="Estado"
              defaultValue="activos"
              options={[
                { value: "activos", label: "Activos" },
                { value: "suspendidos", label: "Suspendidos hoy" },
                { value: "egresados", label: "Egresados" },
                { value: "todos", label: "Todos" },
              ]}
            />
            <FilterSelect
              name="departmentId"
              label="Sector"
              options={[
                { value: "", label: "Todos los sectores" },
                ...filters.departments.map((o) => ({ value: o.id, label: o.label })),
              ]}
            />
            <FilterSelect
              name="workplaceId"
              label="Establecimiento"
              options={[
                { value: "", label: "Todos los establecimientos" },
                ...filters.workplaces.map((o) => ({ value: o.id, label: o.label })),
              ]}
            />
            <FilterSelect
              name="sort"
              label="Orden"
              defaultValue="apellido"
              options={[
                { value: "apellido", label: "Por apellido" },
                { value: "legajo", label: "Por legajo" },
                { value: "ingreso", label: "Por ingreso" },
              ]}
            />
          </div>
        </div>
        {result.items.length === 0 ? (
          filtered || result.query.status !== "activos" ? (
            <EmptyState
              title="No hay empleados que coincidan"
              description="Probá con otra búsqueda o cambiá los filtros."
            />
          ) : (
            <EmptyState
              title="Todavía no hay empleados activos"
              description={canCreate ? 'Usá "Nuevo empleado" para cargar el primer legajo.' : undefined}
            />
          )
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Legajo</TableHead>
                <TableHead>Apellido y nombre</TableHead>
                {canSeePersonal && <TableHead className="hidden md:table-cell">DNI</TableHead>}
                <TableHead className="hidden lg:table-cell">Puesto</TableHead>
                <TableHead className="hidden sm:table-cell">Sector</TableHead>
                <TableHead className="hidden xl:table-cell">Establecimiento</TableHead>
                <TableHead className="hidden md:table-cell">Ingreso</TableHead>
                {result.query.status !== "activos" && <TableHead>Estado</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="tabular-nums">{e.fileNumber}</TableCell>
                  <TableCell>
                    <Link href={`/empleados/${e.id}`} className="text-primary font-medium hover:underline">
                      {e.lastName}, {e.firstName}
                    </Link>
                    {e.suspendedUntil && result.query.status === "activos" && (
                      <Badge variant="warning" className="ml-2">
                        Suspendido
                      </Badge>
                    )}
                    <span className="text-muted-foreground block text-xs sm:hidden">{e.department.name}</span>
                  </TableCell>
                  {canSeePersonal && <TableCell className="hidden tabular-nums md:table-cell">{e.dni}</TableCell>}
                  <TableCell className="hidden lg:table-cell">{e.position.name}</TableCell>
                  <TableCell className="hidden sm:table-cell">{e.department.name}</TableCell>
                  <TableCell className="hidden xl:table-cell">{e.workplace.name}</TableCell>
                  <TableCell className="hidden whitespace-nowrap md:table-cell">{formatDate(e.hireDate)}</TableCell>
                  {result.query.status !== "activos" && (
                    <TableCell>
                      {e.suspendedUntil ? (
                        <Badge variant="warning">Suspendido hasta el {formatDate(e.suspendedUntil)}</Badge>
                      ) : (
                        <Badge variant={e.status === "ACTIVO" ? "success" : "muted"}>{STATUS_LABELS[e.status]}</Badge>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
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

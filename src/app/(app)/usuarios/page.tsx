import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AccessDenied } from "@/components/feedback/access-denied";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { FilterSelect } from "@/components/list/filter-select";
import { Pagination } from "@/components/list/pagination";
import { SearchInput } from "@/components/list/search-input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreateUserButton } from "@/features/users/components/create-user-button";
import { UsersTabs } from "@/features/users/components/users-tabs";
import { UserStatusBadge } from "@/features/users/components/user-status-badge";
import { listRoleOptions, listUsers } from "@/features/users/service";
import { formatDateTime } from "@/lib/format";
import { flattenSearchParams } from "@/lib/list/query";
import { requirePageAccess } from "@/server/auth/request";

export const metadata: Metadata = { title: "Usuarios" };

export default function UsersPage({ searchParams }: PageProps<"/usuarios">) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <UsersContent searchParams={searchParams} />
    </Suspense>
  );
}

async function UsersContent({ searchParams }: { searchParams: PageProps<"/usuarios">["searchParams"] }) {
  const access = await requirePageAccess("user:manage", "usuarios");
  if (!access.allowed) return <AccessDenied />;

  const params = flattenSearchParams(await searchParams);
  const [result, roles] = await Promise.all([listUsers(access.ctx, params), listRoleOptions(access.ctx)]);

  return (
    <>
      <PageHeader
        title="Usuarios y permisos"
        description="Quién puede ingresar al sistema y qué puede hacer."
        actions={<CreateUserButton roles={roles} />}
      />
      <UsersTabs current="/usuarios" />
      <Card>
        <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
          <SearchInput placeholder="Buscar por nombre o email" />
          <FilterSelect
            name="roleId"
            label="Rol"
            options={[{ value: "", label: "Todos los roles" }, ...roles.map((r) => ({ value: r.id, label: r.name }))]}
          />
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
            title="No hay usuarios que coincidan"
            description="Probá con otra búsqueda o cambiá los filtros."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead className="hidden md:table-cell">Email</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="hidden lg:table-cell">Último ingreso</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <Link href={`/usuarios/${user.id}`} className="text-primary font-medium hover:underline">
                      {user.name}
                    </Link>
                    <span className="text-muted-foreground block text-xs md:hidden">{user.email}</span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{user.email}</TableCell>
                  <TableCell>{user.role.name}</TableCell>
                  <TableCell>
                    <UserStatusBadge {...user} />
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden lg:table-cell">
                    {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "Nunca"}
                  </TableCell>
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

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-80 w-full" />
    </div>
  );
}

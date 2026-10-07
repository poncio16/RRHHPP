import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AccessDenied } from "@/components/feedback/access-denied";
import { EmptyState } from "@/components/feedback/empty-state";
import { ListSkeleton } from "@/components/feedback/list-skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { FilterSelect } from "@/components/list/filter-select";
import { Pagination } from "@/components/list/pagination";
import { SearchInput } from "@/components/list/search-input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CatalogActiveToggle } from "@/features/catalogs/components/catalog-active-toggle";
import { CatalogItemDialog } from "@/features/catalogs/components/catalog-item-dialog";
import { CATALOGS, isCatalogKey, labelField, type CatalogKey } from "@/features/catalogs/definitions";
import { getCatalogFormOptions, listCatalog } from "@/features/catalogs/service";
import { flattenSearchParams } from "@/lib/list/query";
import { requirePageAccess } from "@/server/auth/request";

type Props = PageProps<"/configuracion/catalogos/[catalogo]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { catalogo } = await params;
  return { title: isCatalogKey(catalogo) ? CATALOGS[catalogo].title : "Catálogo" };
}

export default function CatalogPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <CatalogContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function CatalogContent({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const { catalogo } = await params;
  if (!isCatalogKey(catalogo)) notFound();
  const access = await requirePageAccess("config:catalogs", "configuracion");
  if (!access.allowed) return <AccessDenied />;

  const key: CatalogKey = catalogo;
  const def = CATALOGS[key];
  const query = flattenSearchParams(await searchParams);
  const result = await listCatalog(access.ctx, key, query);

  // Al editar se tienen que ver las opciones ya asignadas aunque estén inactivas.
  const refFields = def.fields.filter((f) => f.type === "ref");
  const assigned = result.items.flatMap((item) => refFields.map((f) => item.formValues[f.name]));
  const options = await getCatalogFormOptions(
    access.ctx,
    key,
    assigned.filter((v): v is string => typeof v === "string" && v !== ""),
  );
  const activeOptions = Object.fromEntries(
    Object.entries(options).map(([field, list]) => [field, list.filter((o) => o.isActive)]),
  );
  const columns = def.fields.filter((f) => f.inList && f.name !== labelField(def));

  return (
    <>
      <Link
        href="/configuracion"
        className="text-muted-foreground hover:text-foreground mb-2 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden /> Configuración
      </Link>
      <PageHeader
        title={def.title}
        description={def.description}
        actions={<CatalogItemDialog catalog={key} options={activeOptions} />}
      />
      <Card>
        <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
          <SearchInput placeholder="Buscar" />
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
            title={result.query.q || result.query.status !== "activos" ? "No hay resultados" : "Todavía no hay datos"}
            description={
              result.query.q || result.query.status !== "activos"
                ? "Probá con otra búsqueda o cambiá los filtros."
                : `Usá "Nuevo ${def.singular}" para cargar el primero.`
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                {columns.map((column) => (
                  <TableHead key={column.name} className="hidden md:table-cell">
                    {column.label}
                  </TableHead>
                ))}
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    {item.label}
                    {columns.length > 0 && (
                      <span className="text-muted-foreground block text-xs font-normal md:hidden">
                        {columns
                          .map((c) => item.display[c.name])
                          .filter((v) => v && v !== "—")
                          .join(" · ")}
                      </span>
                    )}
                  </TableCell>
                  {columns.map((column) => (
                    <TableCell key={column.name} className="hidden md:table-cell">
                      {item.display[column.name]}
                    </TableCell>
                  ))}
                  <TableCell>
                    <Badge variant={item.isActive ? "success" : "muted"}>{item.isActive ? "Activo" : "Inactivo"}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <CatalogItemDialog catalog={key} options={options} item={item} />
                      <CatalogActiveToggle catalog={key} item={item} />
                    </div>
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
          params={query}
        />
      </Card>
    </>
  );
}

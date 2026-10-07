import { DownloadLink } from "./report-table";

/** Descarga de un listado con los filtros de la pantalla, en Excel y CSV. */
export function ExportButtons({ resource, params }: { resource: string; params: Record<string, string> }) {
  const href = (formato: string) => {
    const query = new URLSearchParams(params);
    query.delete("page");
    query.delete("pageSize");
    query.set("formato", formato);
    return `/api/exportar/${resource}?${query.toString()}`;
  };
  return (
    <>
      <DownloadLink href={href("xlsx")} label="Excel" />
      <DownloadLink href={href("csv")} label="CSV" />
    </>
  );
}

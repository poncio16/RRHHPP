import "server-only";
import { exportAuditLog } from "@/features/audit/service";
import { exportEmployeeList } from "@/features/employees/service";
import { exportNovelties } from "@/features/novelties/service";
import { toIsoDate, todayInTimeZone } from "@/lib/format";
import { recordAudit } from "@/server/audit";
import { assertPermission } from "@/server/authz";
import type { ActorContext } from "@/server/context";
import { NotFoundError } from "@/server/errors";
import { reportToXlsx, tableToCsv } from "@/server/export";
import { isReportSlug, REPORTS } from "./definitions";
import { runReport } from "./service";
import type { ReportResult } from "./table";

/** Listados exportables además de los reportes. */
const LISTS = {
  empleados: { module: "empleados", run: exportEmployeeList },
  novedades: { module: "novedades", run: exportNovelties },
  auditoria: { module: "auditoria", run: exportAuditLog },
} as const;

export type ExportFormat = "csv" | "xlsx";

export type ExportFile = { fileName: string; contentType: string; body: Uint8Array<ArrayBuffer> | string };

/**
 * Arma el archivo de un reporte o listado. Exige "Exportar listados y
 * reportes" además del permiso propio de lo que se exporta, y queda en la
 * auditoría con los filtros y la cantidad de filas.
 */
export async function exportResource(
  ctx: ActorContext,
  resource: string,
  params: Record<string, string>,
): Promise<ExportFile> {
  const { formato, tabla, ...query } = params;
  const format: ExportFormat = formato === "xlsx" ? "xlsx" : "csv";
  const list = resource in LISTS ? LISTS[resource as keyof typeof LISTS] : null;
  if (!list && !isReportSlug(resource)) throw new NotFoundError("No existe ese reporte.");
  const auditModule = list?.module ?? "reportes";
  await assertPermission(ctx, "export:run", auditModule);

  const result: ReportResult = list ? await list.run(ctx, query) : await runReport(ctx, resource as never, query);
  const tables = tabla ? result.tables.filter((t) => t.id === tabla) : result.tables;
  if (tables.length === 0) throw new NotFoundError("No existe esa tabla en el reporte.");
  // El CSV es una sola tabla: la pedida o la primera.
  const exported = format === "csv" ? tables.slice(0, 1) : tables;
  const rows = exported.reduce((sum, t) => sum + t.rows.length, 0);
  const stamp = toIsoDate(todayInTimeZone());
  const suffix = format === "csv" && result.tables.length > 1 ? `-${exported[0]!.id}` : "";

  await recordAudit(ctx, {
    action: "EXPORT",
    module: auditModule,
    entityType: list ? "Listado" : "Reporte",
    after: { recurso: resource, formato: format, tablas: exported.map((t) => t.id), filtros: query, filas: rows },
    message: `Exportó ${list ? "el listado" : "el reporte"} ${list ? result.title : REPORTS[resource as keyof typeof REPORTS].title} (${format.toUpperCase()}, ${rows} ${rows === 1 ? "fila" : "filas"})`,
  });

  return format === "xlsx"
    ? {
        fileName: `${resource}-${stamp}.xlsx`,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        body: new Uint8Array(await reportToXlsx(result, exported)),
      }
    : {
        fileName: `${resource}${suffix}-${stamp}.csv`,
        contentType: "text/csv; charset=utf-8",
        body: tableToCsv(exported[0]!),
      };
}

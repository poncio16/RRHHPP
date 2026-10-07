import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AccessDenied } from "@/components/feedback/access-denied";
import { ListSkeleton } from "@/components/feedback/list-skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { isReportSlug, REPORTS, type ReportSlug } from "@/features/reports/definitions";
import { ReportFilters } from "@/features/reports/components/report-filters";
import { DownloadLink, ReportTableView } from "@/features/reports/components/report-table";
import { getFilterOptions, runReport } from "@/features/reports/service";
import { flattenSearchParams } from "@/lib/list/query";
import { hasPermission } from "@/server/authz";
import { requirePageAccess } from "@/server/auth/request";

type Props = PageProps<"/reportes/[slug]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { title: isReportSlug(slug) ? `Reporte de ${REPORTS[slug].title.toLowerCase()}` : "Reportes" };
}

export default function ReportPage({ params, searchParams }: Props) {
  return (
    <>
      <Link
        href="/reportes"
        className="text-muted-foreground hover:text-foreground mb-2 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden /> Reportes
      </Link>
      <Suspense fallback={<ListSkeleton />}>
        <Content params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Content({ params, searchParams }: Props) {
  const { slug } = await params;
  if (!isReportSlug(slug)) notFound();
  return (
    <>
      <PageHeader title={REPORTS[slug].title} description={REPORTS[slug].description} />
      <Report slug={slug} searchParams={searchParams} />
    </>
  );
}

async function Report({ slug, searchParams }: { slug: ReportSlug; searchParams: Props["searchParams"] }) {
  for (const permission of REPORTS[slug].permissions) {
    const access = await requirePageAccess(permission, "reportes");
    if (!access.allowed) return <AccessDenied />;
  }
  const { ctx } = await requirePageAccess();
  const query = flattenSearchParams(await searchParams);
  const [result, options] = await Promise.all([runReport(ctx, slug, query), getFilterOptions(ctx, slug)]);
  const canExport = hasPermission(ctx, "export:run");
  const exportHref = (extra: Record<string, string>) =>
    `/api/exportar/${slug}?${new URLSearchParams({ ...query, ...extra }).toString()}`;

  return (
    <div className="space-y-4">
      <Card>
        <ReportFilters slug={slug} options={options} />
        <div className="flex flex-wrap items-start justify-between gap-3 border-t px-4 py-3">
          <ul className="text-muted-foreground min-w-0 space-y-0.5 text-sm">
            {result.filters.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {canExport && <DownloadLink href={exportHref({ formato: "xlsx" })} label="Excel" />}
        </div>
      </Card>
      {result.notice && <Alert>{result.notice}</Alert>}
      {result.tables.map((table) => (
        <ReportTableView
          key={table.id}
          table={table}
          csvHref={canExport ? exportHref({ formato: "csv", tabla: table.id }) : null}
        />
      ))}
    </div>
  );
}

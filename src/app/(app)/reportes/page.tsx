import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState } from "@/components/feedback/empty-state";
import { ListSkeleton } from "@/components/feedback/list-skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { REPORT_SLUGS, REPORTS } from "@/features/reports/definitions";
import { canSeeReport } from "@/features/reports/service";
import { requirePageAccess } from "@/server/auth/request";

export const metadata: Metadata = { title: "Reportes" };

export default function ReportsPage() {
  return (
    <>
      <PageHeader
        title="Reportes"
        description="Se calculan en el momento con los datos cargados; se filtran y se exportan a Excel o CSV."
      />
      <Suspense fallback={<ListSkeleton />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  const { ctx } = await requirePageAccess();
  const available = REPORT_SLUGS.filter((slug) => canSeeReport(ctx, slug));
  if (available.length === 0) {
    return (
      <Card>
        <EmptyState
          title="No tenés reportes habilitados"
          description="Tu rol no incluye permisos de reportes. Si los necesitás, pedíselos al administrador del sistema."
        />
      </Card>
    );
  }
  return (
    <Card>
      <ul className="divide-y">
        {available.map((slug) => (
          <li key={slug}>
            <Link
              href={`/reportes/${slug}`}
              className="hover:bg-muted/50 flex items-center justify-between gap-3 px-5 py-4"
            >
              <span className="min-w-0">
                <span className="text-primary block font-medium">{REPORTS[slug].title}</span>
                <span className="text-muted-foreground block text-sm">{REPORTS[slug].description}</span>
              </span>
              <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

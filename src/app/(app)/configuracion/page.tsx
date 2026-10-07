import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AccessDenied } from "@/components/feedback/access-denied";
import { ListSkeleton } from "@/components/feedback/list-skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { CATALOG_KEYS, CATALOG_SECTIONS, CATALOGS, type CatalogSection } from "@/features/catalogs/definitions";
import { ConfigTabs } from "@/features/configuration/config-tabs";
import { requirePageAccess } from "@/server/auth/request";

export const metadata: Metadata = { title: "Configuración" };

export default function ConfigurationPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <ConfigurationContent />
    </Suspense>
  );
}

async function ConfigurationContent() {
  const access = await requirePageAccess("config:catalogs", "configuracion");
  if (!access.allowed) return <AccessDenied />;

  const sections = Object.entries(CATALOG_SECTIONS) as [CatalogSection, string][];
  return (
    <>
      <PageHeader
        title="Configuración"
        description="Catálogos y parámetros que usan los legajos y el resto de los módulos."
      />
      <ConfigTabs current="/configuracion" permissions={access.ctx.permissions} />
      <div className="flex flex-col gap-6">
        {sections.map(([section, title]) => (
          <section key={section} aria-labelledby={`seccion-${section}`}>
            <h2 id={`seccion-${section}`} className="text-muted-foreground mb-2 text-xs font-semibold uppercase">
              {title}
            </h2>
            <Card className="divide-y">
              {CATALOG_KEYS.filter((key) => CATALOGS[key].section === section).map((key) => (
                <Link
                  key={key}
                  href={`/configuracion/catalogos/${key}`}
                  className="hover:bg-accent flex items-center justify-between gap-4 px-4 py-3"
                >
                  <span>
                    <span className="block text-sm font-medium">{CATALOGS[key].title}</span>
                    <span className="text-muted-foreground block text-xs">{CATALOGS[key].description}</span>
                  </span>
                  <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
                </Link>
              ))}
            </Card>
          </section>
        ))}
      </div>
    </>
  );
}

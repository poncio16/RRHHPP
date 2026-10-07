import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/feedback/access-denied";
import { ListSkeleton } from "@/components/feedback/list-skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { CompanyForm } from "@/features/company/components/company-form";
import { getCompany, getCompanyFormOptions } from "@/features/company/service";
import { ConfigTabs } from "@/features/configuration/config-tabs";
import { requirePageAccess } from "@/server/auth/request";

export const metadata: Metadata = { title: "Empresa" };

export default function CompanyPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <CompanyContent />
    </Suspense>
  );
}

async function CompanyContent() {
  const access = await requirePageAccess("config:manage", "configuracion");
  if (!access.allowed) return <AccessDenied />;

  const company = await getCompany(access.ctx);
  const options = await getCompanyFormOptions(access.ctx, [
    company?.defaultArtProviderId ?? null,
    company?.defaultWorkplaceId ?? null,
  ]);

  return (
    <>
      <PageHeader
        title="Configuración"
        description="Catálogos y parámetros que usan los legajos y el resto de los módulos."
      />
      <ConfigTabs current="/configuracion/empresa" permissions={access.ctx.permissions} />
      {!company && (
        <Alert className="mb-4">Todavía no se cargaron los datos de la empresa. Completalos para empezar.</Alert>
      )}
      <Card>
        <CardContent className="pt-6">
          <CompanyForm company={company} options={options} />
        </CardContent>
      </Card>
    </>
  );
}

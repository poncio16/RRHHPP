import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AccessDenied } from "@/components/feedback/access-denied";
import { ListSkeleton } from "@/components/feedback/list-skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfigTabs } from "@/features/configuration/config-tabs";
import { VacationRulesForm } from "@/features/vacations/components/vacation-rules-form";
import { getRulesForEdit } from "@/features/vacations/service";
import { requirePageAccess } from "@/server/auth/request";

export const metadata: Metadata = { title: "Reglas de vacaciones" };

export default function VacationRulesPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const access = await requirePageAccess("config:manage", "configuracion");
  if (!access.allowed) return <AccessDenied />;
  const rules = await getRulesForEdit(access.ctx);

  return (
    <>
      <PageHeader
        title="Configuración"
        description="Catálogos y parámetros que usan los legajos y el resto de los módulos."
      />
      <ConfigTabs current="/configuracion/vacaciones" permissions={access.ctx.permissions} />
      <Card>
        <CardHeader>
          <CardTitle>Días de vacaciones por antigüedad</CardTitle>
          <CardDescription>
            Cada regla vale para una antigüedad mayor que &quot;más de&quot; y hasta &quot;hasta&quot; años inclusive,
            calculada a la fecha de corte de{" "}
            <Link href="/configuracion/parametros" className="text-primary hover:underline">
              Parámetros
            </Link>
            . Los valores iniciales son los de referencia de la Ley de Contrato de Trabajo: validalos con el asesor
            laboral o el convenio. Los días se cuentan como indique el tipo de licencia de vacaciones, y cambiar las
            reglas no modifica los períodos ya generados.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VacationRulesForm
            rules={rules.map((r) => ({
              minSeniorityYears: String(r.minSeniorityYears),
              maxSeniorityYears: r.maxSeniorityYears === null ? "" : String(r.maxSeniorityYears),
              days: String(r.days),
            }))}
          />
        </CardContent>
      </Card>
    </>
  );
}

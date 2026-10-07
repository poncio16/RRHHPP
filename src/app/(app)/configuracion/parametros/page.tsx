import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/feedback/access-denied";
import { ListSkeleton } from "@/components/feedback/list-skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfigTabs } from "@/features/configuration/config-tabs";
import { SettingForm } from "@/features/settings/components/setting-form";
import { listSettings } from "@/features/settings/service";
import { requirePageAccess } from "@/server/auth/request";

export const metadata: Metadata = { title: "Parámetros" };

export default function SettingsPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <SettingsContent />
    </Suspense>
  );
}

async function SettingsContent() {
  const access = await requirePageAccess("config:manage", "configuracion");
  if (!access.allowed) return <AccessDenied />;
  const settings = await listSettings(access.ctx);

  return (
    <>
      <PageHeader
        title="Configuración"
        description="Catálogos y parámetros que usan los legajos y el resto de los módulos."
      />
      <ConfigTabs current="/configuracion/parametros" permissions={access.ctx.permissions} />
      <div className="flex flex-col gap-4">
        {settings.map((setting) => (
          <Card key={setting.key}>
            <CardHeader>
              <CardTitle>{setting.title}</CardTitle>
              <CardDescription>{setting.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <SettingForm settingKey={setting.key} value={setting.value} />
            </CardContent>
          </Card>
        ))}
        <p className="text-muted-foreground text-sm">
          Los parámetros de alertas, asistencia y reportes se agregan acá junto con cada módulo.
        </p>
      </div>
    </>
  );
}

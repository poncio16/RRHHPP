import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getSystemStatus } from "@/features/system/service";
import { requirePageAccess } from "@/server/auth/request";

export const metadata: Metadata = { title: "Inicio" };

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Inicio"
        description="Los indicadores de RRHH se incorporan en la Fase 11, cuando existan datos de personal."
      />
      <Suspense fallback={<Skeleton className="h-40 w-full max-w-xl" />}>
        <SystemStatusCard />
      </Suspense>
    </>
  );
}

async function SystemStatusCard() {
  await requirePageAccess();
  const status = await getSystemStatus();

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Estado de la instalación</CardTitle>
        <CardDescription>Información leída en este momento de la base de datos.</CardDescription>
      </CardHeader>
      <CardContent>
        {status.database === "error" ? (
          <p className="text-destructive text-sm">
            No se pudo conectar con la base de datos. Revisá DATABASE_URL y que PostgreSQL esté en marcha.
          </p>
        ) : (
          <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Base de datos</dt>
            <dd>
              <Badge variant="success">Conectada</Badge>
            </dd>
            <dt className="text-muted-foreground">Migraciones aplicadas</dt>
            <dd className="text-right tabular-nums">{status.migrations}</dd>
            <dt className="text-muted-foreground">Provincias cargadas</dt>
            <dd className="text-right tabular-nums">{status.reference.provinces}</dd>
            <dt className="text-muted-foreground">Valores de listas de referencia</dt>
            <dd className="text-right tabular-nums">{status.reference.lookupValues}</dd>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

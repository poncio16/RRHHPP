import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AccessDenied } from "@/components/feedback/access-denied";
import { ListSkeleton } from "@/components/feedback/list-skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ImportPanel } from "@/features/withdrawals/components/import-panel";
import { WITHDRAWALS_MAX_BYTES, WITHDRAWALS_MAX_FILES } from "@/features/withdrawals/constants";
import { getAccountOptions } from "@/features/withdrawals/service";
import { requirePageAccess } from "@/server/auth/request";

export const metadata: Metadata = { title: "Importar planillas de retiros" };

export default function ImportWithdrawalsPage() {
  return (
    <>
      <Link
        href="/retiros"
        className="text-muted-foreground hover:text-foreground mb-2 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden /> Retiros
      </Link>
      <PageHeader
        title="Importar planillas de retiros"
        description="Se pueden subir varias planillas juntas, en cualquier orden. Los movimientos que ya estaban cargados se descartan."
      />
      <Suspense fallback={<ListSkeleton />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  const access = await requirePageAccess("salary:write", "retiros");
  if (!access.allowed) return <AccessDenied />;
  const accounts = await getAccountOptions(access.ctx);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Subir planillas</CardTitle>
        <CardDescription>
          Cada hoja es la cuenta de una persona y se identifica por su nombre: la primera vez se crea la cuenta y en las
          planillas siguientes la misma hoja suma a esa cuenta. Se leen las columnas Fecha, Ingreso, Retiro y
          Descripción (el saldo lo calcula el sistema); los retiros pueden tener signo menos y una fila sin fecha toma
          la de la fila anterior. Una fila repetida de una planilla a otra no se vuelve a cargar, pero dos retiros
          iguales del mismo día en la misma hoja se cargan los dos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ImportPanel accounts={accounts} maxFiles={WITHDRAWALS_MAX_FILES} maxMb={WITHDRAWALS_MAX_BYTES / 1024 / 1024} />
      </CardContent>
    </Card>
  );
}

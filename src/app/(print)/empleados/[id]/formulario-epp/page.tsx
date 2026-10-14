import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AccessDenied } from "@/components/feedback/access-denied";
import { PrintButton } from "@/components/layout/print-button";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PpeFormSheet } from "@/features/ppe/components/ppe-form-sheet";
import { layoutPpeForm } from "@/features/ppe/layout";
import { getPpeForm } from "@/features/ppe/service";
import { z } from "@/lib/zod";
import { requirePageAccess } from "@/server/auth/request";
import { ConflictError, NotFoundError } from "@/server/errors";

export const metadata: Metadata = { title: "Formulario de entrega de EPP" };

export default function PpeFormPage({ params }: PageProps<"/empleados/[id]/formulario-epp">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: PageProps<"/empleados/[id]/formulario-epp">["params"] }) {
  const access = await requirePageAccess("employee:read", "empleados");
  if (!access.allowed) return <AccessDenied />;
  const personal = await requirePageAccess("employee.personal:read", "empleados");
  if (!personal.allowed) return <AccessDenied />;
  const parsed = z.uuid().safeParse((await params).id);
  if (!parsed.success) notFound();
  const form = await getPpeForm(access.ctx, parsed.data).catch((error: unknown) => {
    if (error instanceof NotFoundError) notFound();
    if (error instanceof ConflictError) return error;
    throw error;
  });
  if (form instanceof ConflictError) {
    return (
      <div className="flex max-w-xl flex-col items-start gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Formulario de entrega de EPP</h1>
        <Alert variant="warning">{form.message}</Alert>
        <Link href={`/empleados/${parsed.data}`} className={buttonVariants({ variant: "outline" })}>
          Volver al legajo
        </Link>
      </div>
    );
  }

  const layout = layoutPpeForm(form);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex max-w-[285mm] flex-col gap-3 print:hidden">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Formulario de entrega de EPP</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {form.worker.name}. Se imprime en A4 apaisado; los renglones se completan a mano en cada entrega y los
              firma el trabajador. Después subí el formulario firmado a la documentación del legajo.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/empleados/${form.employeeId}`} className={buttonVariants({ variant: "outline" })}>
              Volver al legajo
            </Link>
            <PrintButton />
          </div>
        </div>
        {!layout.fits && (
          <Alert variant="warning">
            La descripción o los elementos de protección del puesto «{form.position.name}» son demasiado largos para que
            el formulario entre en una hoja y se cortan al imprimir: acortalos en Configuración → Catálogos → Puestos.
          </Alert>
        )}
        {form.missing.length > 0 && (
          <Alert variant="warning">
            <p className="font-medium">Estos datos van a salir en blanco:</p>
            <ul className="mt-1 list-disc pl-5">
              {form.missing.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </Alert>
        )}
      </div>
      <div className="overflow-x-auto print:overflow-visible">
        <div className="w-fit shadow-sm ring-1 ring-black/10 print:shadow-none print:ring-0">
          <PpeFormSheet form={form} layout={layout} />
        </div>
      </div>
    </div>
  );
}

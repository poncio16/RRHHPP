import { Printer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AccessDenied } from "@/components/feedback/access-denied";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmployeeDetails } from "@/features/employees/components/employee-details";
import { EmployeeHeader } from "@/features/employees/components/employee-header";
import { loadEmployeePage } from "@/features/employees/page-data";
import { hasPermission } from "@/server/authz";

export const metadata: Metadata = { title: "Legajo" };

export default function EmployeePage({ params }: PageProps<"/empleados/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: PageProps<"/empleados/[id]">["params"] }) {
  const page = await loadEmployeePage(params);
  if (!page.allowed) return <AccessDenied />;
  // El formulario lleva el DNI; a un egresado ya no se le entregan elementos.
  const canPrintPpe = page.employee.status !== "EGRESADO" && hasPermission(page.ctx, "employee.personal:read");
  return (
    <>
      <EmployeeHeader
        employee={page.employee}
        current="datos"
        access={page}
        actions={
          canPrintPpe && (
            <Link
              href={`/empleados/${page.employee.id}/formulario-epp`}
              target="_blank"
              className={buttonVariants({ variant: "outline" })}
            >
              <Printer /> Formulario de EPP
            </Link>
          )
        }
      />
      <EmployeeDetails employee={page.employee} />
    </>
  );
}

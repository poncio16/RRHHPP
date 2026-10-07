import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/feedback/access-denied";
import { Skeleton } from "@/components/ui/skeleton";
import { EmployeeDetails } from "@/features/employees/components/employee-details";
import { EmployeeHeader } from "@/features/employees/components/employee-header";
import { loadEmployeePage } from "@/features/employees/page-data";

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
  return (
    <>
      <EmployeeHeader
        employee={page.employee}
        current="datos"
        canEdit={page.canEdit}
        canSeeBank={page.canSeeBank}
        canSeeDocuments={page.canSeeDocuments}
      />
      <EmployeeDetails employee={page.employee} />
    </>
  );
}

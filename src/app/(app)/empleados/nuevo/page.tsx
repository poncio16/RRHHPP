import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AccessDenied } from "@/components/feedback/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { EmployeeForm } from "@/features/employees/components/employee-form";
import { getEmployeeFormOptions } from "@/features/employees/service";
import { hasPermission } from "@/server/authz";
import { requirePageAccess } from "@/server/auth/request";

export const metadata: Metadata = { title: "Nuevo empleado" };

export default function NewEmployeePage() {
  return (
    <Suspense fallback={<Skeleton className="h-[40rem] w-full" />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const access = await requirePageAccess("employee:write", "empleados");
  if (!access.allowed || !hasPermission(access.ctx, "employee.personal:read")) return <AccessDenied />;
  const options = await getEmployeeFormOptions(access.ctx);
  return (
    <>
      <Link href="/empleados" className="text-muted-foreground text-sm hover:underline">
        ← Empleados
      </Link>
      <PageHeader title="Nuevo empleado" description="Los campos con * son obligatorios." />
      <EmployeeForm options={options} />
    </>
  );
}

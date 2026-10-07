import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AccessDenied } from "@/components/feedback/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { EmployeeForm } from "@/features/employees/components/employee-form";
import { loadEmployeePage } from "@/features/employees/page-data";
import { getEmployeeFormOptions } from "@/features/employees/service";

export const metadata: Metadata = { title: "Editar legajo" };

export default function EditEmployeePage({ params }: PageProps<"/empleados/[id]/editar">) {
  return (
    <Suspense fallback={<Skeleton className="h-[40rem] w-full" />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: PageProps<"/empleados/[id]/editar">["params"] }) {
  const page = await loadEmployeePage(params);
  if (!page.allowed || !page.canEdit || !page.employee.formValues) return <AccessDenied />;
  const { employee } = page;
  const values = employee.formValues!;
  const options = await getEmployeeFormOptions(page.ctx, [
    values.nationalityId,
    values.maritalStatusId,
    values.departmentId,
    values.positionId,
    values.categoryId,
    values.agreementId,
    values.contractTypeId,
    values.workdayTypeId,
    values.workScheduleId,
    values.workModalityId,
    values.workplaceId,
    values.supervisorId,
    values.healthInsurerId,
    values.artProviderId,
  ]);
  return (
    <>
      <Link href={`/empleados/${employee.id}`} className="text-muted-foreground text-sm hover:underline">
        ← Legajo {employee.fileNumber}
      </Link>
      <PageHeader
        title={`Editar: ${employee.lastName}, ${employee.firstName}`}
        description="Los cambios de puesto, sector, categoría, convenio, contratación, jornada, horario, modalidad, establecimiento o superior quedan en el historial."
      />
      <EmployeeForm options={options} employee={{ id: employee.id, version: employee.version, values }} />
    </>
  );
}

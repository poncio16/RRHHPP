import { ChevronLeft, Pencil } from "lucide-react";
import Link from "next/link";
import { SectionTabs } from "@/components/layout/section-tabs";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { formatDate, todayInTimeZone } from "@/lib/format";
import { formatSeniority, seniority } from "../calc";
import { STATUS_LABELS } from "../constants";
import type { EmployeeView } from "../service";

/** Encabezado del legajo con datos clave y pestañas según permisos. */
export function EmployeeHeader({
  employee,
  current,
  canEdit,
  canSeeBank,
  canSeeDocuments,
}: {
  employee: EmployeeView;
  current: "datos" | "bancarios" | "documentacion" | "historial";
  canEdit: boolean;
  canSeeBank: boolean;
  canSeeDocuments: boolean;
}) {
  const base = `/empleados/${employee.id}`;
  const active = employee.status === "ACTIVO";
  const to = active ? todayInTimeZone() : (employee.labor.exitDate ?? todayInTimeZone());
  const tabs = [
    { href: base, label: "Datos" },
    ...(canSeeBank ? [{ href: `${base}/bancarios`, label: "Datos bancarios" }] : []),
    ...(canSeeDocuments ? [{ href: `${base}/documentacion`, label: "Documentación" }] : []),
    { href: `${base}/historial`, label: "Historial laboral" },
  ];
  const currentHref = current === "datos" ? base : `${base}/${current}`;

  return (
    <>
      <Link
        href="/empleados"
        className="text-muted-foreground hover:text-foreground mb-2 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden /> Empleados
      </Link>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">
              {employee.lastName}, {employee.firstName}
            </h1>
            <Badge variant={active ? "success" : "muted"}>{STATUS_LABELS[employee.status]}</Badge>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            Legajo {employee.fileNumber} · {employee.labor.position.name} · {employee.labor.department.name}
          </p>
          <p className="text-muted-foreground text-sm">
            Ingreso {formatDate(employee.labor.hireDate)} · Antigüedad{" "}
            {formatSeniority(seniority(employee.labor.seniorityDate, to))}
          </p>
        </div>
        {canEdit && current === "datos" && (
          <Link href={`${base}/editar`} className={buttonVariants({ variant: "outline" })}>
            <Pencil /> Editar legajo
          </Link>
        )}
      </div>
      <SectionTabs tabs={tabs} current={currentHref} />
    </>
  );
}

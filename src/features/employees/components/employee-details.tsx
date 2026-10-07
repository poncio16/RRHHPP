import type { ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { formatCuil } from "@/lib/validators";
import { SEX_OPTIONS } from "../constants";
import type { EmployeeView } from "../service";

const name = (v: { name: string } | null | undefined) => v?.name ?? null;
const label = (v: { label: string } | null | undefined) => v?.label ?? null;

/** Ficha del legajo en modo lectura. Lo que el usuario no puede ver ni llega del servidor. */
export function EmployeeDetails({ employee }: { employee: EmployeeView }) {
  const { labor, personal } = employee;
  return (
    <div className="flex flex-col gap-4">
      {personal ? (
        <>
          <Section title="Datos personales">
            <Item label="DNI" value={personal.dni} />
            <Item label="CUIL" value={formatCuil(personal.cuil)} />
            <Item label="Fecha de nacimiento" value={formatDate(personal.birthDate)} />
            <Item label="Sexo" value={SEX_OPTIONS.find((o) => o.value === personal.sex)?.label} />
            <Item label="Nacionalidad" value={label(personal.nationality)} />
            <Item label="Estado civil" value={label(personal.maritalStatus)} />
          </Section>
          <Section title="Contacto">
            <Item
              label="Domicilio"
              value={`${personal.addressLine}, ${personal.city} (${personal.postalCode}), ${personal.province.name}`}
              wide
            />
            <Item label="Teléfono" value={personal.phone} />
            <Item label="Email personal" value={personal.email} />
            <Item
              label="Contacto de emergencia"
              value={
                [personal.emergencyContactName, personal.emergencyContactPhone].filter(Boolean).join(" · ") || null
              }
            />
          </Section>
        </>
      ) : (
        <Alert>Tu rol no incluye ver los datos personales y de contacto de este legajo.</Alert>
      )}
      <Section title="Datos laborales">
        <Item label="Fecha de ingreso" value={formatDate(labor.hireDate)} />
        <Item label="Antigüedad reconocida desde" value={formatDate(labor.seniorityDate)} />
        <Item label="Tipo de contrato" value={labor.contractType.name} />
        {labor.contractEndDate && <Item label="Fin de contrato" value={formatDate(labor.contractEndDate)} />}
        {labor.exitDate && <Item label="Fecha de egreso" value={formatDate(labor.exitDate)} />}
        <Item label="Puesto" value={labor.position.name} />
        <Item label="Sector" value={labor.department.name} />
        <Item label="Establecimiento" value={labor.workplace.name} />
        <Item label="Convenio" value={name(labor.agreement)} />
        <Item label="Categoría" value={name(labor.category)} />
        <Item label="Jornada" value={name(labor.workdayType)} />
        <Item label="Horario" value={name(labor.workSchedule)} />
        <Item label="Modalidad" value={label(labor.workModality)} />
        <Item
          label="Superior directo"
          value={labor.supervisor ? `${labor.supervisor.lastName}, ${labor.supervisor.firstName}` : null}
        />
        <Item label="Obra social" value={name(labor.healthInsurer)} />
        <Item label="ART" value={name(labor.artProvider)} />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">{children}</dl>
      </CardContent>
    </Card>
  );
}

function Item({ label, value, wide }: { label: string; value: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2 lg:col-span-3" : undefined}>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-0.5 text-sm">{value || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

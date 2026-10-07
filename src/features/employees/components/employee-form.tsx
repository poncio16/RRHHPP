"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useForm, useWatch, type FieldPath } from "react-hook-form";
import { toast } from "sonner";
import { applyActionErrors } from "@/components/forms/action-errors";
import { FormField, fieldA11y } from "@/components/forms/form-field";
import { useUnsavedChanges } from "@/components/forms/use-unsaved-changes";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cuilMatchesDni, isValidCuil, isValidDni } from "@/lib/validators";
import { createEmployeeAction, updateEmployeeAction } from "../actions";
import { HISTORIC_FIELD_NAMES, HISTORIC_FIELDS, SEX_OPTIONS } from "../constants";
import { employeeSchema } from "../schemas";
import type { EmployeeFormOptions, EmployeeFormValues } from "../service";

type Values = EmployeeFormValues & { effectiveDate: string; changeNotes: string };
type Option = { id: string; label: string; isActive: boolean };

const EMPTY: EmployeeFormValues = {
  fileNumber: "",
  lastName: "",
  firstName: "",
  dni: "",
  cuil: "",
  birthDate: "",
  sex: "",
  nationalityId: "",
  maritalStatusId: "",
  addressLine: "",
  city: "",
  provinceId: "",
  postalCode: "",
  phone: "",
  email: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  hireDate: "",
  seniorityDate: "",
  contractEndDate: "",
  departmentId: "",
  positionId: "",
  categoryId: "",
  agreementId: "",
  contractTypeId: "",
  workdayTypeId: "",
  workScheduleId: "",
  workModalityId: "",
  workplaceId: "",
  supervisorId: "",
  healthInsurerId: "",
  artProviderId: "",
};

/** Alta (sin `employee`) o edición del legajo. */
export function EmployeeForm({
  options,
  employee,
}: {
  options: EmployeeFormOptions;
  employee?: { id: string; version: number; values: EmployeeFormValues };
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const initial: Values = {
    ...EMPTY,
    ...(employee
      ? employee.values
      : { artProviderId: options.companyDefaults.artProviderId, workplaceId: options.companyDefaults.workplaceId }),
    effectiveDate: "",
    changeNotes: "",
  };
  const form = useForm<Values>({
    resolver: zodResolver(employeeSchema) as never,
    defaultValues: initial,
    mode: "onSubmit",
  });
  const { isDirty, dirtyFields } = form.formState;
  useUnsavedChanges(isDirty && !pending);

  const watched = useWatch({ control: form.control });
  const historicChanges = employee
    ? HISTORIC_FIELD_NAMES.filter((f) => dirtyFields[f] && watched[f] !== employee.values[f])
    : [];
  const needsEndDate = options.contractTypesWithEndDate.includes(watched.contractTypeId ?? "");
  const categories = options.categories.filter((c) => {
    const agreement = options.categoryAgreement[c.id];
    return !agreement || agreement === watched.agreementId || c.id === watched.categoryId;
  });
  const supervisors = options.supervisors.filter((s) => s.id !== employee?.id);

  // Al elegir un puesto con sector sugerido, se completa el sector si estaba vacío.
  const positionId = watched.positionId;
  useEffect(() => {
    const suggested = positionId ? options.positionDepartment[positionId] : null;
    if (suggested && !form.getValues("departmentId")) {
      form.setValue("departmentId", suggested, { shouldDirty: true, shouldValidate: true });
    }
  }, [positionId, options.positionDepartment, form]);

  const cuilWarning =
    watched.dni &&
    watched.cuil &&
    isValidDni(watched.dni) &&
    isValidCuil(watched.cuil) &&
    !cuilMatchesDni(watched.cuil, watched.dni)
      ? "Atención: los dígitos centrales del CUIL no coinciden con el DNI."
      : undefined;

  const submit = form.handleSubmit((values) => {
    setFormError(undefined);
    const raw = form.getValues();
    startTransition(async () => {
      const result = employee
        ? await updateEmployeeAction(employee.id, {
            ...values,
            version: employee.version,
            effectiveDate: raw.effectiveDate,
            changeNotes: raw.changeNotes,
          })
        : await createEmployeeAction(values);
      if (!result.ok) {
        setFormError(applyActionErrors(result.error, form.setError));
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      form.reset(form.getValues());
      if (employee) {
        toast.success("Legajo actualizado");
        router.push(`/empleados/${employee.id}`);
      } else {
        const created = result.data as { id: string; fileNumber: number };
        toast.success(`Legajo ${created.fileNumber} creado`);
        router.push(`/empleados/${created.id}`);
      }
      router.refresh();
    });
  });

  const error = (name: FieldPath<Values>) => form.getFieldState(name, form.formState).error?.message;
  const text = (
    name: FieldPath<Values>,
    label: string,
    props: {
      required?: boolean;
      hint?: string;
      type?: string;
      inputMode?: "numeric" | "tel" | "email";
      className?: string;
    } = {},
  ) => (
    <FormField
      id={name}
      label={label}
      error={error(name)}
      hint={props.hint}
      required={props.required}
      className={props.className}
    >
      <Input
        {...fieldA11y(name, error(name))}
        type={props.type}
        inputMode={props.inputMode}
        autoComplete="off"
        {...form.register(name)}
      />
    </FormField>
  );
  const select = (
    name: FieldPath<Values>,
    label: string,
    list: readonly (Option | { id: string; label: string; isActive?: boolean })[],
    props: { required?: boolean; hint?: string; placeholder?: string } = {},
  ) => (
    <FormField id={name} label={label} error={error(name)} hint={props.hint} required={props.required}>
      <Select {...fieldA11y(name, error(name))} {...form.register(name)}>
        <option value="">{props.placeholder ?? (props.required ? "Elegí una opción…" : "Sin asignar")}</option>
        {list.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
            {o.isActive === false ? " (inactivo)" : ""}
          </option>
        ))}
      </Select>
    </FormField>
  );

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {formError && <Alert variant="destructive">{formError}</Alert>}

      <Section title="Datos personales">
        {text("lastName", "Apellido", { required: true })}
        {text("firstName", "Nombre", { required: true })}
        {text("dni", "DNI", { required: true, inputMode: "numeric", hint: "Con o sin puntos." })}
        <FormField id="cuil" label="CUIL" error={error("cuil")} hint={cuilWarning ?? "Con o sin guiones."} required>
          <Input
            {...fieldA11y("cuil", error("cuil"))}
            inputMode="numeric"
            autoComplete="off"
            {...form.register("cuil")}
          />
        </FormField>
        {text("birthDate", "Fecha de nacimiento", { required: true, type: "date" })}
        {select(
          "sex",
          "Sexo (según DNI)",
          SEX_OPTIONS.map((o) => ({ id: o.value, label: o.label })),
          { required: true },
        )}
        {select("nationalityId", "Nacionalidad", options.nationalities)}
        {select("maritalStatusId", "Estado civil", options.maritalStatuses)}
      </Section>

      <Section title="Contacto">
        {text("addressLine", "Domicilio", { required: true })}
        {text("city", "Localidad", { required: true })}
        {select("provinceId", "Provincia", options.provinces, { required: true })}
        {text("postalCode", "Código postal", { required: true })}
        {text("phone", "Teléfono", { inputMode: "tel" })}
        {text("email", "Email personal", { type: "email", inputMode: "email" })}
        {text("emergencyContactName", "Contacto de emergencia")}
        {text("emergencyContactPhone", "Teléfono de emergencia", { inputMode: "tel" })}
      </Section>

      <Section title="Datos laborales">
        {text("fileNumber", "Número de legajo", {
          inputMode: "numeric",
          hint: employee ? undefined : "Si lo dejás vacío se asigna el siguiente.",
          required: !!employee,
        })}
        {text("hireDate", "Fecha de ingreso", { required: true, type: "date" })}
        {text("seniorityDate", "Antigüedad reconocida desde", {
          type: "date",
          hint: "Solo si es distinta del ingreso (por ejemplo, por un reingreso).",
        })}
        {select("contractTypeId", "Tipo de contrato", options.contractTypes, { required: true })}
        {needsEndDate && text("contractEndDate", "Fin de contrato", { type: "date", required: true })}
        {select("positionId", "Puesto", options.positions, { required: true })}
        {select("departmentId", "Sector", options.departments, { required: true })}
        {select("workplaceId", "Establecimiento", options.workplaces, { required: true })}
        {select("agreementId", "Convenio", options.agreements)}
        {select("categoryId", "Categoría", categories)}
        {select("workdayTypeId", "Jornada", options.workdayTypes)}
        {select("workScheduleId", "Horario", options.workSchedules)}
        {select("workModalityId", "Modalidad", options.workModalities)}
        {select("supervisorId", "Superior directo", supervisors)}
        {select("healthInsurerId", "Obra social", options.healthInsurers)}
        {select("artProviderId", "ART", options.artProviders)}
      </Section>

      {historicChanges.length > 0 && (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle>Cambio laboral</CardTitle>
            <CardDescription>
              Cambiaste {historicChanges.map((f) => HISTORIC_FIELDS[f].label.toLowerCase()).join(", ")}. Queda en el
              historial del legajo con esta fecha.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {text("effectiveDate", "Vigente desde", { type: "date", required: true })}
            {text("changeNotes", "Observaciones", { hint: "Por ejemplo, el motivo del cambio." })}
          </CardContent>
        </Card>
      )}

      <div className="bg-background/95 sticky bottom-0 -mx-4 flex justify-end gap-2 border-t px-4 py-3 backdrop-blur lg:-mx-6 lg:px-6">
        <Button variant="outline" onClick={() => router.back()} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending || (!!employee && !isDirty)}>
          {pending ? "Guardando…" : employee ? "Guardar cambios" : "Crear legajo"}
        </Button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</CardContent>
    </Card>
  );
}

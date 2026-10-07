"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { applyActionErrors } from "@/components/forms/action-errors";
import { FormField, fieldA11y } from "@/components/forms/form-field";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatCuil } from "@/lib/validators";
import type { z } from "@/lib/zod";
import { saveCompanyAction } from "../actions";
import { companySchema, type CompanyInput } from "../schemas";

type Option = { id: string; label: string; isActive: boolean };
type Values = { [K in keyof CompanyInput]-?: string };

export function CompanyForm({
  company,
  options,
}: {
  company: Partial<Record<keyof CompanyInput, string | null>> | null;
  options: { provinces: Option[]; artProviders: Option[]; workplaces: Option[] };
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const defaults: Values = {
    legalName: company?.legalName ?? "",
    tradeName: company?.tradeName ?? "",
    cuit: company?.cuit ? formatCuil(company.cuit) : "",
    addressLine: company?.addressLine ?? "",
    city: company?.city ?? "",
    provinceId: company?.provinceId ?? "",
    postalCode: company?.postalCode ?? "",
    defaultArtProviderId: company?.defaultArtProviderId ?? "",
    defaultWorkplaceId: company?.defaultWorkplaceId ?? "",
  };
  const form = useForm<Values, unknown, z.output<typeof companySchema>>({
    resolver: zodResolver(companySchema) as never,
    defaultValues: defaults,
    mode: "onSubmit",
  });
  const { errors, isDirty } = form.formState;

  const submit = form.handleSubmit((values) => {
    setFormError(undefined);
    startTransition(async () => {
      const result = await saveCompanyAction(values);
      if (!result.ok) {
        setFormError(applyActionErrors(result.error, form.setError));
        return;
      }
      toast.success("Datos de la empresa guardados");
      form.reset({ ...form.getValues(), cuit: formatCuil(values.cuit) });
      router.refresh();
    });
  });

  const text = (
    name: keyof Values,
    label: string,
    props: { required?: boolean; hint?: string; inputMode?: "numeric" } = {},
  ) => (
    <FormField id={name} label={label} error={errors[name]?.message} hint={props.hint} required={props.required}>
      <Input {...fieldA11y(name, errors[name]?.message)} inputMode={props.inputMode} {...form.register(name)} />
    </FormField>
  );
  const select = (name: keyof Values, label: string, list: Option[], hint?: string) => (
    <FormField id={name} label={label} error={errors[name]?.message} hint={hint}>
      <Select {...fieldA11y(name, errors[name]?.message)} {...form.register(name)}>
        <option value="">Sin asignar</option>
        {list.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
            {o.isActive ? "" : " (inactivo)"}
          </option>
        ))}
      </Select>
    </FormField>
  );

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      {formError && <Alert variant="destructive">{formError}</Alert>}
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-semibold">Identificación</legend>
        {text("legalName", "Razón social", { required: true })}
        {text("tradeName", "Nombre de fantasía", { hint: "Es el nombre que se muestra en la barra superior." })}
        {text("cuit", "CUIT", { required: true, hint: "Con o sin guiones.", inputMode: "numeric" })}
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-semibold">Domicilio</legend>
        {text("addressLine", "Domicilio")}
        {text("city", "Localidad")}
        {select("provinceId", "Provincia", options.provinces)}
        {text("postalCode", "Código postal")}
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-semibold">Valores sugeridos para legajos nuevos</legend>
        {select("defaultArtProviderId", "ART", options.artProviders)}
        {select("defaultWorkplaceId", "Establecimiento", options.workplaces)}
      </fieldset>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending || (!!company && !isDirty)}>
          {pending ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </form>
  );
}

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
import { SETTING_DEFINITIONS, type SettingKey } from "@/server/settings/definitions";
import { saveSettingAction } from "../actions";

type Values = Record<string, number>;

/** Formulario de un grupo de parámetros numéricos. */
export function SettingForm({ settingKey, value }: { settingKey: SettingKey; value: Values }) {
  const definition = SETTING_DEFINITIONS[settingKey];
  const router = useRouter();
  const [formError, setFormError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const form = useForm<Values>({
    resolver: zodResolver(definition.schema) as never,
    defaultValues: value,
    mode: "onBlur",
  });
  const { errors, isDirty } = form.formState;

  const submit = form.handleSubmit((values) => {
    setFormError(undefined);
    startTransition(async () => {
      const result = await saveSettingAction(settingKey, values);
      if (!result.ok) {
        setFormError(applyActionErrors(result.error, form.setError));
        return;
      }
      toast.success("Parámetros guardados");
      form.reset(values);
      router.refresh();
    });
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {formError && <Alert variant="destructive">{formError}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        {definition.fields.map((field) => {
          const id = `${settingKey}-${field.name}`;
          const error = errors[field.name]?.message;
          return (
            <FormField
              key={field.name}
              id={id}
              label={`${field.label} (${field.unit})`}
              error={error}
              hint={field.hint}
              required
            >
              <Input
                {...fieldA11y(id, error)}
                type="number"
                inputMode="numeric"
                step={1}
                {...form.register(field.name, { valueAsNumber: true })}
              />
            </FormField>
          );
        })}
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !isDirty}>
          {pending ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </form>
  );
}

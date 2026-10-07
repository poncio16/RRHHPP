"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { applyActionErrors } from "@/components/forms/action-errors";
import { FormField, fieldA11y } from "@/components/forms/form-field";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { ActionResult } from "@/server/errors/result";
import { CATALOGS, type CatalogKey } from "../definitions";
import { catalogItemSchema } from "../schemas";

type Values = Record<string, string | boolean>;
export type CatalogOption = { id: string; label: string; isActive: boolean };

/** Formulario genérico de un catálogo, armado a partir de su definición. */
export function CatalogItemForm({
  catalog,
  mode,
  defaultValues,
  options,
  onSubmit,
  onCancel,
}: {
  catalog: CatalogKey;
  mode: "create" | "update";
  defaultValues?: Values;
  options: Record<string, CatalogOption[]>;
  onSubmit: (values: Record<string, unknown>) => Promise<ActionResult<unknown>>;
  onCancel: () => void;
}) {
  const def = CATALOGS[catalog];
  const schema = useMemo(() => catalogItemSchema(def, mode), [def, mode]);
  const initial = useMemo(
    () =>
      Object.fromEntries(
        def.fields.map((f) => [f.name, defaultValues?.[f.name] ?? (f.type === "boolean" ? false : "")]),
      ),
    [def, defaultValues],
  );
  const [formError, setFormError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const form = useForm<Values, unknown, Record<string, unknown>>({
    resolver: zodResolver(schema) as never,
    defaultValues: initial,
    mode: "onBlur",
  });
  const { errors, isDirty } = form.formState;
  const errorOf = (name: string) => errors[name]?.message as string | undefined;

  const submit = form.handleSubmit((values) => {
    setFormError(undefined);
    startTransition(async () => {
      const result = await onSubmit(values);
      if (!result.ok) setFormError(applyActionErrors(result.error, form.setError));
    });
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {formError && <Alert variant="destructive">{formError}</Alert>}
      {def.fields.map((field) => {
        const id = `field-${field.name}`;
        const error = errorOf(field.name);
        if (field.type === "boolean") {
          return (
            <div key={field.name} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Checkbox id={id} {...form.register(field.name)} />
                <Label htmlFor={id}>{field.label}</Label>
              </div>
              {field.hint && <p className="text-muted-foreground pl-6 text-xs">{field.hint}</p>}
            </div>
          );
        }
        const required = field.type === "hours" || field.required;
        if (field.type === "ref") {
          return (
            <FormField key={field.name} id={id} label={field.label} error={error} hint={field.hint} required={required}>
              <Select {...fieldA11y(id, error)} {...form.register(field.name)}>
                <option value="">{required ? "Elegí una opción…" : "Sin asignar"}</option>
                {(options[field.name] ?? []).map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                    {option.isActive ? "" : " (inactivo)"}
                  </option>
                ))}
              </Select>
            </FormField>
          );
        }
        const locked = field.type === "text" && field.immutable && mode === "update";
        return (
          <FormField
            key={field.name}
            id={id}
            label={field.label}
            error={error}
            hint={field.hint}
            required={required && !locked}
          >
            <Input
              {...fieldA11y(id, error)}
              autoComplete="off"
              inputMode={field.type === "hours" ? "decimal" : undefined}
              disabled={locked}
              {...form.register(field.name)}
            />
          </FormField>
        );
      })}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending || (mode === "update" && !isDirty)}>
          {pending ? "Guardando…" : mode === "create" ? "Crear" : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}

"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { applyActionErrors } from "@/components/forms/action-errors";
import { FormField, fieldA11y } from "@/components/forms/form-field";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { z } from "@/lib/zod";
import type { ActionResult } from "@/server/errors/result";
import { updateUserSchema } from "../schemas";

type Values = z.input<typeof updateUserSchema>;
type RoleOption = { id: string; name: string };

/**
 * Formulario de alta y edición. En el alta no se muestra "activo" (todo
 * usuario nuevo nace activo).
 */
export function UserForm({
  roles,
  defaultValues,
  mode,
  disabledFields = [],
  onSubmit,
  onCancel,
}: {
  roles: RoleOption[];
  defaultValues?: Partial<Values>;
  mode: "create" | "edit";
  disabledFields?: ("roleId" | "isActive")[];
  onSubmit: (values: Values) => Promise<ActionResult<unknown>>;
  onCancel?: () => void;
}) {
  const [formError, setFormError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const form = useForm<Values>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: { name: "", email: "", roleId: "", isActive: true, ...defaultValues },
    mode: "onBlur",
  });
  const { errors, isDirty } = form.formState;

  const submit = form.handleSubmit((values) => {
    setFormError(undefined);
    startTransition(async () => {
      const result = await onSubmit(values);
      if (!result.ok) setFormError(applyActionErrors(result.error, form.setError));
      else form.reset(values);
    });
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {formError && <Alert variant="destructive">{formError}</Alert>}
      <FormField id="name" label="Nombre y apellido" error={errors.name?.message} required>
        <Input {...fieldA11y("name", errors.name?.message)} autoComplete="off" {...form.register("name")} />
      </FormField>
      <FormField id="email" label="Email" error={errors.email?.message} required>
        <Input
          {...fieldA11y("email", errors.email?.message)}
          type="email"
          autoComplete="off"
          {...form.register("email")}
        />
      </FormField>
      <FormField id="roleId" label="Rol" error={errors.roleId?.message} required>
        <Select
          {...fieldA11y("roleId", errors.roleId?.message)}
          disabled={disabledFields.includes("roleId")}
          {...form.register("roleId")}
        >
          <option value="">Elegí un rol…</option>
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </Select>
      </FormField>
      {mode === "edit" && (
        <div className="flex items-center gap-2">
          <Checkbox id="isActive" disabled={disabledFields.includes("isActive")} {...form.register("isActive")} />
          <Label htmlFor="isActive">Usuario activo</Label>
        </div>
      )}
      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={pending || (mode === "edit" && !isDirty)}>
          {pending ? "Guardando…" : mode === "create" ? "Crear usuario" : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}

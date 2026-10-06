"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { applyActionErrors } from "@/components/forms/action-errors";
import { FormField, fieldA11y } from "@/components/forms/form-field";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { z } from "@/lib/zod";
import { loginAction } from "../actions";
import { loginSchema } from "../schemas";

type Values = z.input<typeof loginSchema>;

export function LoginForm() {
  const [formError, setFormError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const form = useForm<Values>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setFormError(undefined);
    startTransition(async () => {
      // Si el login es correcto, la acción redirige y no devuelve nada.
      const result = await loginAction(values);
      if (result && !result.ok) {
        setFormError(applyActionErrors(result.error, form.setError));
        form.setValue("password", "");
      }
    });
  });

  return (
    <form onSubmit={onSubmit} method="post" noValidate className="flex flex-col gap-4">
      {formError && <Alert variant="destructive">{formError}</Alert>}
      <FormField id="email" label="Email" error={errors.email?.message}>
        <Input
          {...fieldA11y("email", errors.email?.message)}
          type="email"
          autoComplete="username"
          autoFocus
          {...form.register("email")}
        />
      </FormField>
      <FormField id="password" label="Contraseña" error={errors.password?.message}>
        <Input
          {...fieldA11y("password", errors.password?.message)}
          type="password"
          autoComplete="current-password"
          {...form.register("password")}
        />
      </FormField>
      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? "Ingresando…" : "Ingresar"}
      </Button>
    </form>
  );
}

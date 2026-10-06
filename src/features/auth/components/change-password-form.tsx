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
import type { z } from "@/lib/zod";
import { changePasswordAction } from "../actions";
import { changePasswordSchema } from "../schemas";

type Values = z.input<ReturnType<typeof changePasswordSchema>>;

export function ChangePasswordForm({ minLength }: { minLength: number }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const form = useForm<Values>({
    resolver: zodResolver(changePasswordSchema(minLength)),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setFormError(undefined);
    startTransition(async () => {
      const result = await changePasswordAction(values);
      if (!result.ok) {
        setFormError(applyActionErrors(result.error, form.setError));
        return;
      }
      toast.success("Contraseña actualizada. Se cerraron tus otras sesiones.");
      router.push("/dashboard");
    });
  });

  return (
    <form onSubmit={onSubmit} method="post" noValidate className="flex flex-col gap-4">
      {formError && <Alert variant="destructive">{formError}</Alert>}
      <FormField id="currentPassword" label="Contraseña actual" error={errors.currentPassword?.message} required>
        <Input
          {...fieldA11y("currentPassword", errors.currentPassword?.message)}
          type="password"
          autoComplete="current-password"
          {...form.register("currentPassword")}
        />
      </FormField>
      <FormField
        id="newPassword"
        label="Nueva contraseña"
        error={errors.newPassword?.message}
        hint={`Al menos ${minLength} caracteres, con letras y números.`}
        required
      >
        <Input
          {...fieldA11y("newPassword", errors.newPassword?.message)}
          type="password"
          autoComplete="new-password"
          {...form.register("newPassword")}
        />
      </FormField>
      <FormField
        id="confirmPassword"
        label="Repetí la nueva contraseña"
        error={errors.confirmPassword?.message}
        required
      >
        <Input
          {...fieldA11y("confirmPassword", errors.confirmPassword?.message)}
          type="password"
          autoComplete="new-password"
          {...form.register("confirmPassword")}
        />
      </FormField>
      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? "Guardando…" : "Cambiar contraseña"}
      </Button>
    </form>
  );
}

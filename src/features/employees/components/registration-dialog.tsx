"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { applyActionErrors } from "@/components/forms/action-errors";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatDate, toIsoDate } from "@/lib/format";
import { updateRegistrationAction } from "../actions";
import { registrationFormSchema } from "../schemas";
import type { EmployeeView } from "../service";
import { RegistrationFields } from "./registration-fields";

type Values = { registration: string; registeredSince: string; unregisteredSince: string };

/** Texto de la marca de registro que va al lado del nombre. */
export function registrationText(registration: EmployeeView["registration"]) {
  const since = registration.status === "CON_REGISTRO" ? registration.registeredSince : registration.unregisteredSince;
  if (registration.status === "CON_REGISTRO") {
    return since ? `Con registro · alta ARCA ${formatDate(since)}` : "Con registro";
  }
  return since ? `Sin registro desde el ${formatDate(since)}` : "Sin registro";
}

/**
 * Marca "con registro" / "sin registro" del encabezado del legajo. Quien
 * puede editar legajos la toca para cambiarla junto con sus fechas.
 */
export function RegistrationBadge({
  employeeId,
  version,
  registration,
  canEdit,
}: {
  employeeId: string;
  version: number;
  registration: EmployeeView["registration"];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const d = (date: Date | null) => (date ? toIsoDate(date) : "");
  const initial: Values = {
    registration: registration.status,
    registeredSince: d(registration.registeredSince),
    unregisteredSince: d(registration.unregisteredSince),
  };
  const form = useForm<Values>({
    resolver: zodResolver(registrationFormSchema) as never,
    defaultValues: initial,
    mode: "onSubmit",
  });
  const { errors, isDirty } = form.formState;
  const value = useWatch({ control: form.control, name: "registration" });
  const variant = registration.status === "CON_REGISTRO" ? "success" : "warning";
  const text = registrationText(registration);

  if (!canEdit) return <Badge variant={variant}>{text}</Badge>;

  const submit = form.handleSubmit((values) => {
    setFormError(undefined);
    startTransition(async () => {
      const result = await updateRegistrationAction(employeeId, { ...values, version });
      if (!result.ok) {
        setFormError(applyActionErrors(result.error, form.setError));
        return;
      }
      toast.success("Registro actualizado");
      setOpen(false);
      router.refresh();
    });
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          form.reset(initial);
          setFormError(undefined);
        }
      }}
    >
      <DialogTrigger asChild>
        <button type="button" className="rounded-md" title="Cambiar el registro">
          <Badge variant={variant} className="hover:ring-ring/40 cursor-pointer hover:ring-2">
            {text}
          </Badge>
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registro del empleado</DialogTitle>
          <DialogDescription>
            Los empleados con registro salen en la nómina de personal. Si la fecha del estado elegido queda vacía, se
            toma la de ingreso.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {formError && <Alert variant="destructive">{formError}</Alert>}
          <RegistrationFields
            idPrefix="registro"
            value={value}
            register={{
              registration: form.register("registration"),
              registeredSince: form.register("registeredSince"),
              unregisteredSince: form.register("unregisteredSince"),
            }}
            errors={{
              registration: errors.registration?.message,
              registeredSince: errors.registeredSince?.message,
              unregisteredSince: errors.unregisteredSince?.message,
            }}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || !isDirty}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { applyActionErrors } from "@/components/forms/action-errors";
import { FormField, fieldA11y } from "@/components/forms/form-field";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createHolidayAction, updateHolidayAction } from "../actions";
import { holidaySchema, type HolidayInput } from "../schemas";

type Values = Required<HolidayInput>;

const EMPTY: Values = { date: "", name: "", isNonWorkingOptional: false };

/** Alta (sin `holiday`) o edición de un feriado. */
export function HolidayDialog({ holiday }: { holiday?: { id: string } & Values }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const form = useForm<Values>({
    resolver: zodResolver(holidaySchema) as never,
    defaultValues: holiday ?? EMPTY,
    mode: "onSubmit",
  });
  const { errors, isDirty } = form.formState;
  const prefix = holiday ? `holiday-${holiday.id}` : "holiday-new";

  const submit = form.handleSubmit((values) => {
    setFormError(undefined);
    startTransition(async () => {
      const result = holiday ? await updateHolidayAction(holiday.id, values) : await createHolidayAction(values);
      if (!result.ok) {
        setFormError(applyActionErrors(result.error, form.setError));
        return;
      }
      toast.success(holiday ? "Feriado actualizado" : "Feriado agregado");
      setOpen(false);
      form.reset(holiday ? values : EMPTY);
      router.refresh();
    });
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) {
          form.reset(holiday ?? EMPTY);
          setFormError(undefined);
        }
      }}
    >
      <DialogTrigger asChild>
        {holiday ? (
          <Button variant="ghost" size="icon" aria-label={`Editar ${holiday.name}`}>
            <Pencil />
          </Button>
        ) : (
          <Button>
            <Plus /> Nuevo feriado
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{holiday ? "Editar feriado" : "Nuevo feriado"}</DialogTitle>
          <DialogDescription>
            Los feriados se descuentan al contar días hábiles de licencias y vacaciones.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {formError && <Alert variant="destructive">{formError}</Alert>}
          <FormField id={`${prefix}-date`} label="Fecha" error={errors.date?.message} required>
            <Input {...fieldA11y(`${prefix}-date`, errors.date?.message)} type="date" {...form.register("date")} />
          </FormField>
          <FormField id={`${prefix}-name`} label="Nombre" error={errors.name?.message} required>
            <Input
              {...fieldA11y(`${prefix}-name`, errors.name?.message)}
              autoComplete="off"
              {...form.register("name")}
            />
          </FormField>
          <div className="flex items-center gap-2">
            <Checkbox id={`${prefix}-optional`} {...form.register("isNonWorkingOptional")} />
            <Label htmlFor={`${prefix}-optional`}>Día no laborable (optativo para el empleador)</Label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || (!!holiday && !isDirty)}>
              {pending ? "Guardando…" : holiday ? "Guardar cambios" : "Agregar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

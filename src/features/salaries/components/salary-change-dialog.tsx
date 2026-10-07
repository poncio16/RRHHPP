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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createSalaryChangeAction, updateSalaryChangeAction } from "../actions";
import { salaryChangeSchema } from "../schemas";

type Values = { effectiveDate: string; basicSalary: string; notes: string };

/** Alta de un básico nuevo o corrección de uno cargado (la fecha no cambia). */
export function SalaryChangeDialog({
  employeeId,
  today,
  record,
}: {
  employeeId: string;
  today: string;
  record?: { id: string; version: string; title: string; values: Values };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const initial: Values = record?.values ?? { effectiveDate: today, basicSalary: "", notes: "" };
  const form = useForm<Values>({
    resolver: zodResolver(salaryChangeSchema) as never,
    defaultValues: initial,
    mode: "onSubmit",
  });
  const { errors, isDirty } = form.formState;

  const submit = form.handleSubmit((values) => {
    setFormError(undefined);
    startTransition(async () => {
      const result = record
        ? await updateSalaryChangeAction(record.id, { ...values, version: record.version })
        : await createSalaryChangeAction(employeeId, values);
      if (!result.ok) {
        setFormError(applyActionErrors<Values>(result.error, form.setError));
        return;
      }
      toast.success(record ? "Se corrigió el básico" : "Se registró el básico");
      setOpen(false);
      form.reset(initial);
      router.refresh();
    });
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) {
          form.reset(initial);
          setFormError(undefined);
        }
      }}
    >
      <DialogTrigger asChild>
        {record ? (
          <Button variant="ghost" size="icon" aria-label={`Corregir ${record.title}`}>
            <Pencil />
          </Button>
        ) : (
          <Button>
            <Plus /> Registrar básico
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{record ? "Corregir básico" : "Registrar básico"}</DialogTitle>
          <DialogDescription>
            {record
              ? record.title
              : "Sueldo básico pactado a partir de una fecha. El vigente es el de fecha más reciente hasta hoy."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {formError && <Alert variant="destructive">{formError}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="salary-date" label="Rige desde" error={errors.effectiveDate?.message} required>
              <Input
                {...fieldA11y("salary-date", errors.effectiveDate?.message)}
                type="date"
                max={today}
                readOnly={!!record}
                {...form.register("effectiveDate")}
              />
            </FormField>
            <FormField id="salary-amount" label="Sueldo básico" error={errors.basicSalary?.message} required>
              <Input
                {...fieldA11y("salary-amount", errors.basicSalary?.message)}
                inputMode="decimal"
                placeholder="0,00"
                {...form.register("basicSalary")}
              />
            </FormField>
          </div>
          <FormField id="salary-notes" label="Observaciones" error={errors.notes?.message}>
            <Textarea
              {...fieldA11y("salary-notes", errors.notes?.message)}
              rows={2}
              placeholder="Por ejemplo, acuerdo paritario o cambio de categoría."
              {...form.register("notes")}
            />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || (!!record && !isDirty)}>
              {pending ? "Guardando…" : record ? "Guardar cambios" : "Registrar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

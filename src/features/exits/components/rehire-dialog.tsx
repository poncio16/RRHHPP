"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { UserPlus } from "lucide-react";
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
import { rehireEmployeeAction } from "../actions";
import { rehireSchema } from "../schemas";

type Values = { hireDate: string; seniorityDate: string; contractEndDate: string; notes: string; version: number };

/**
 * Reingreso sobre el mismo legajo. La antigüedad reconocida queda vacía (se
 * cuenta desde el reingreso) salvo que se indique otra fecha.
 */
export function RehireDialog({
  employeeId,
  name,
  version,
  lastExit,
  currentSeniority,
  today,
}: {
  employeeId: string;
  name: string;
  version: number;
  /** Fecha del último egreso, en texto. */
  lastExit: string;
  /** Antigüedad reconocida anterior (AAAA-MM-DD), para ofrecer mantenerla. */
  currentSeniority: string;
  today: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const initial: Values = { hireDate: today, seniorityDate: "", contractEndDate: "", notes: "", version };
  const form = useForm<Values>({
    resolver: zodResolver(rehireSchema) as never,
    defaultValues: initial,
    mode: "onSubmit",
  });
  const { errors } = form.formState;

  const reset = () => {
    form.reset(initial);
    setFormError(undefined);
  };

  const submit = form.handleSubmit((values) => {
    setFormError(undefined);
    startTransition(async () => {
      const result = await rehireEmployeeAction(employeeId, values);
      if (!result.ok) {
        setFormError(applyActionErrors<Values>(result.error, form.setError));
        return;
      }
      toast.success("Reingreso registrado: el empleado vuelve a activo");
      setOpen(false);
      reset();
      router.refresh();
    });
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <UserPlus /> Registrar reingreso
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar reingreso</DialogTitle>
          <DialogDescription>
            {name} vuelve sobre el mismo legajo. El egreso del {lastExit} queda en el historial. Después revisá en
            &quot;Editar legajo&quot; el puesto, el sector y los demás datos laborales.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {formError && <Alert variant="destructive">{formError}</Alert>}
          <FormField id="rehire-date" label="Fecha de reingreso" error={errors.hireDate?.message} required>
            <Input {...fieldA11y("rehire-date", errors.hireDate?.message)} type="date" {...form.register("hireDate")} />
          </FormField>
          <FormField
            id="rehire-seniority"
            label="Antigüedad reconocida desde"
            error={errors.seniorityDate?.message}
            hint="Vacío: se cuenta desde el reingreso. Si se reconoce el período anterior, indicá desde cuándo."
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                {...fieldA11y("rehire-seniority", errors.seniorityDate?.message)}
                type="date"
                {...form.register("seniorityDate")}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => form.setValue("seniorityDate", currentSeniority, { shouldDirty: true })}
              >
                Mantener la anterior
              </Button>
            </div>
          </FormField>
          <FormField
            id="rehire-contract-end"
            label="Fin de contrato"
            error={errors.contractEndDate?.message}
            hint="Solo para contrataciones a plazo."
          >
            <Input
              {...fieldA11y("rehire-contract-end", errors.contractEndDate?.message)}
              type="date"
              {...form.register("contractEndDate")}
            />
          </FormField>
          <FormField id="rehire-notes" label="Observaciones" error={errors.notes?.message}>
            <Textarea {...fieldA11y("rehire-notes", errors.notes?.message)} rows={2} {...form.register("notes")} />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Registrar reingreso"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { SlidersHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
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
import { updateBalanceAction } from "../actions";
import { balanceSchema } from "../schemas";

type Values = { adjustmentDays: string; adjustmentReason: string; carriedOverDays: string; notes: string };

/** Ajuste manual de un período: días de más o de menos (con motivo), arrastre y observaciones. */
export function BalanceDialog({
  balance,
}: {
  balance: { id: string; version: string; title: string; entitledDays: number; used: number; values: Values };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const form = useForm<Values>({
    resolver: zodResolver(balanceSchema) as never,
    defaultValues: balance.values,
    mode: "onSubmit",
  });
  const { errors, isDirty } = form.formState;
  const [adjustment, carried] = useWatch({ control: form.control, name: ["adjustmentDays", "carriedOverDays"] });
  const total = balance.entitledDays + (Number(adjustment) || 0) + (Number(carried) || 0);

  const submit = form.handleSubmit((values) => {
    setFormError(undefined);
    startTransition(async () => {
      const result = await updateBalanceAction(balance.id, { ...values, version: balance.version });
      if (!result.ok) {
        setFormError(applyActionErrors<Values>(result.error, form.setError));
        return;
      }
      toast.success("Período actualizado");
      setOpen(false);
      router.refresh();
    });
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) {
          form.reset(balance.values);
          setFormError(undefined);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Ajustar ${balance.title}`}>
          <SlidersHorizontal />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajustar período</DialogTitle>
          <DialogDescription>
            {balance.title}. Corresponden {balance.entitledDays} días según las reglas; usados {balance.used}.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {formError && <Alert variant="destructive">{formError}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id="balance-adjustment"
              label="Ajuste (días)"
              error={errors.adjustmentDays?.message}
              hint="Negativo para descontar."
              required
            >
              <Input
                {...fieldA11y("balance-adjustment", errors.adjustmentDays?.message)}
                inputMode="numeric"
                {...form.register("adjustmentDays")}
              />
            </FormField>
            <FormField
              id="balance-carried"
              label="Arrastre de períodos anteriores (días)"
              error={errors.carriedOverDays?.message}
              required
            >
              <Input
                {...fieldA11y("balance-carried", errors.carriedOverDays?.message)}
                inputMode="numeric"
                {...form.register("carriedOverDays")}
              />
            </FormField>
          </div>
          <FormField
            id="balance-reason"
            label="Motivo del ajuste"
            error={errors.adjustmentReason?.message}
            hint="Obligatorio si hay ajuste."
          >
            <Input
              {...fieldA11y("balance-reason", errors.adjustmentReason?.message)}
              {...form.register("adjustmentReason")}
            />
          </FormField>
          <FormField id="balance-notes" label="Observaciones" error={errors.notes?.message}>
            <Textarea {...fieldA11y("balance-notes", errors.notes?.message)} rows={3} {...form.register("notes")} />
          </FormField>
          <p className="text-muted-foreground text-sm" aria-live="polite">
            Total del período: <span className="text-foreground font-medium">{total} días</span>
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || !isDirty}>
              {pending ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

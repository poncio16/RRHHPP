"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
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
import { Select } from "@/components/ui/select";
import { createEntryAction } from "../actions";
import { entrySchema } from "../schemas";

type Values = { accountId: string; date: string; concept: string; credit: string; debit: string };

/**
 * Carga a mano de un ingreso o un retiro. Con `accountId` (página de la
 * cuenta) la cuenta ya está elegida.
 */
export function EntryDialog({
  accountId,
  accounts,
  today,
}: {
  accountId?: string;
  accounts?: { id: string; label: string }[];
  today: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const initial: Values = { accountId: accountId ?? "", date: today, concept: "", credit: "", debit: "" };
  const form = useForm<Values>({
    resolver: zodResolver(entrySchema) as never,
    defaultValues: initial,
    mode: "onSubmit",
  });
  const { errors } = form.formState;

  const submit = form.handleSubmit((values) => {
    setFormError(undefined);
    startTransition(async () => {
      const result = await createEntryAction(values);
      if (!result.ok) {
        setFormError(applyActionErrors<Values>(result.error, form.setError));
        return;
      }
      toast.success("Se registró el movimiento");
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
        <Button variant={accountId ? "default" : "outline"}>
          <Plus /> Registrar movimiento
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar movimiento</DialogTitle>
          <DialogDescription>Un ingreso o un retiro de la cuenta corriente, cargado a mano.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {formError && <Alert variant="destructive">{formError}</Alert>}
          {!accountId && (
            <FormField id="entry-account" label="Cuenta" error={errors.accountId?.message} required>
              <Select {...fieldA11y("entry-account", errors.accountId?.message)} {...form.register("accountId")}>
                <option value="">Elegí la cuenta</option>
                {(accounts ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </Select>
            </FormField>
          )}
          <FormField id="entry-date" label="Fecha" error={errors.date?.message} required>
            <Input
              {...fieldA11y("entry-date", errors.date?.message)}
              type="date"
              max={today}
              {...form.register("date")}
            />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="entry-credit" label="Ingreso" error={errors.credit?.message}>
              <Input
                {...fieldA11y("entry-credit", errors.credit?.message)}
                inputMode="decimal"
                placeholder="0,00"
                {...form.register("credit")}
              />
            </FormField>
            <FormField id="entry-debit" label="Retiro" error={errors.debit?.message}>
              <Input
                {...fieldA11y("entry-debit", errors.debit?.message)}
                inputMode="decimal"
                placeholder="0,00"
                {...form.register("debit")}
              />
            </FormField>
          </div>
          <FormField id="entry-concept" label="Concepto" error={errors.concept?.message}>
            <Input
              {...fieldA11y("entry-concept", errors.concept?.message)}
              maxLength={200}
              placeholder="Por ejemplo, sueldo de octubre o adelanto."
              {...form.register("concept")}
            />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Registrar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

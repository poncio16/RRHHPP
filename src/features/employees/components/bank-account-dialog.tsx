"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus } from "lucide-react";
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
import { Select } from "@/components/ui/select";
import { cbuBankCode, isValidCbu } from "@/lib/validators";
import { saveBankAccountAction } from "../actions";
import { bankAccountSchema } from "../schemas";

type Values = { cbu: string; alias: string; accountTypeId: string; effectiveDate: string; changeNotes: string };
type Option = { id: string; label: string };

/** Alta o cambio de la cuenta sueldo. El banco se deduce del CBU. */
export function BankAccountDialog({
  employeeId,
  current,
  accountTypes,
  banks,
}: {
  employeeId: string;
  current: { cbu: string; alias: string | null; accountTypeId: string } | null;
  accountTypes: Option[];
  banks: { code: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const initial: Values = {
    cbu: current?.cbu ?? "",
    alias: current?.alias ?? "",
    accountTypeId: current?.accountTypeId ?? "",
    effectiveDate: "",
    changeNotes: "",
  };
  const form = useForm<Values>({
    resolver: zodResolver(bankAccountSchema) as never,
    defaultValues: initial,
    mode: "onBlur",
  });
  const { errors, isDirty } = form.formState;
  const cbu = useWatch({ control: form.control, name: "cbu" });
  const detected = isValidCbu(cbu ?? "") ? banks.find((b) => b.code === cbuBankCode(cbu)) : undefined;

  const submit = form.handleSubmit((values) => {
    setFormError(undefined);
    startTransition(async () => {
      const result = await saveBankAccountAction(employeeId, values);
      if (!result.ok) {
        setFormError(applyActionErrors(result.error, form.setError));
        return;
      }
      toast.success("Datos bancarios guardados");
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
          form.reset(initial);
          setFormError(undefined);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant={current ? "outline" : "default"}>
          {current ? <Pencil /> : <Plus />} {current ? "Cambiar cuenta" : "Cargar cuenta sueldo"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{current ? "Cambiar cuenta sueldo" : "Cuenta sueldo"}</DialogTitle>
          <DialogDescription>
            El banco se reconoce por los primeros 3 dígitos del CBU. {current && "El cambio queda en el historial."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {formError && <Alert variant="destructive">{formError}</Alert>}
          <FormField
            id="bank-cbu"
            label="CBU"
            error={errors.cbu?.message}
            hint={detected ? `Banco: ${detected.name}` : "22 dígitos."}
            required
          >
            <Input
              {...fieldA11y("bank-cbu", errors.cbu?.message)}
              inputMode="numeric"
              autoComplete="off"
              {...form.register("cbu")}
            />
          </FormField>
          <FormField id="bank-alias" label="Alias" error={errors.alias?.message}>
            <Input {...fieldA11y("bank-alias", errors.alias?.message)} autoComplete="off" {...form.register("alias")} />
          </FormField>
          <FormField id="bank-type" label="Tipo de cuenta" error={errors.accountTypeId?.message} required>
            <Select {...fieldA11y("bank-type", errors.accountTypeId?.message)} {...form.register("accountTypeId")}>
              <option value="">Elegí una opción…</option>
              {accountTypes.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </Select>
          </FormField>
          {current && (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                id="bank-effective"
                label="Vigente desde"
                error={errors.effectiveDate?.message}
                hint="Si lo dejás vacío, desde hoy."
              >
                <Input
                  {...fieldA11y("bank-effective", errors.effectiveDate?.message)}
                  type="date"
                  {...form.register("effectiveDate")}
                />
              </FormField>
              <FormField id="bank-notes" label="Observaciones" error={errors.changeNotes?.message}>
                <Input
                  {...fieldA11y("bank-notes", errors.changeNotes?.message)}
                  autoComplete="off"
                  {...form.register("changeNotes")}
                />
              </FormField>
            </div>
          )}
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

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
import { Textarea } from "@/components/ui/textarea";
import { CONCEPT_NATURE_LABELS } from "@/features/salaries/constants";
import { createNoveltyAction, updateNoveltyAction } from "../actions";
import { noveltyEmployeeSchema, noveltySchema } from "../schemas";
import type { NoveltyTypeOption } from "../service";

type Values = {
  employeeId: string;
  noveltyTypeId: string;
  date: string;
  period: string;
  quantity: string;
  amount: string;
  notes: string;
};

const withEmployeeSchema = noveltySchema.and(noveltyEmployeeSchema);

/**
 * Alta o modificación de una novedad manual. El tipo indica si pide importe o
 * cantidad; el período es el mes de liquidación al que se informa.
 */
export function NoveltyDialog({
  employeeId,
  employees,
  types,
  defaultDate,
  defaultPeriod,
  record,
}: {
  employeeId: string | null;
  employees?: { id: string; label: string }[];
  types: NoveltyTypeOption[];
  defaultDate: string;
  defaultPeriod: string;
  record?: { id: string; version: string; title: string; status: string; values: Omit<Values, "employeeId"> };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const pickEmployee = !employeeId && !record;
  const initial: Values = record
    ? { ...record.values, employeeId: employeeId ?? "" }
    : {
        employeeId: employeeId ?? "",
        noveltyTypeId: "",
        date: defaultDate,
        period: defaultPeriod,
        quantity: "",
        amount: "",
        notes: "",
      };
  const form = useForm<Values>({
    resolver: zodResolver(pickEmployee ? withEmployeeSchema : noveltySchema) as never,
    defaultValues: initial,
    mode: "onSubmit",
  });
  const { errors, isDirty } = form.formState;
  const typeId = useWatch({ control: form.control, name: "noveltyTypeId" });
  const type = types.find((t) => t.id === typeId);
  const available = types.filter((t) => t.isActive || t.id === record?.values.noveltyTypeId);

  const reset = () => {
    form.reset(initial);
    setFormError(undefined);
  };

  const submit = form.handleSubmit((values) => {
    setFormError(undefined);
    startTransition(async () => {
      const payload = { ...values, version: record?.version ?? null };
      const result = record
        ? await updateNoveltyAction(record.id, payload)
        : await createNoveltyAction(employeeId, payload);
      if (!result.ok) {
        setFormError(applyActionErrors<Values>(result.error, form.setError));
        return;
      }
      toast.success(
        record
          ? record.status === "APROBADA"
            ? "Novedad modificada: volvió a pendiente de aprobación"
            : "Novedad modificada"
          : "Novedad registrada",
      );
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
        {record ? (
          <Button variant="ghost" size="icon" aria-label={`Modificar ${record.title}`}>
            <Pencil />
          </Button>
        ) : (
          <Button>
            <Plus /> Nueva novedad
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{record ? "Modificar novedad" : "Nueva novedad"}</DialogTitle>
          <DialogDescription>
            {record
              ? `${record.title}${record.status === "APROBADA" ? ". Al guardar vuelve a pendiente de aprobación." : "."}`
              : "Adelantos, premios, descuentos, sanciones u otros conceptos para informar a la liquidación."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {formError && <Alert variant="destructive">{formError}</Alert>}
          {pickEmployee && (
            <FormField id="novelty-employee" label="Empleado" error={errors.employeeId?.message} required>
              <Select {...fieldA11y("novelty-employee", errors.employeeId?.message)} {...form.register("employeeId")}>
                <option value="">Elegí un empleado…</option>
                {(employees ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </Select>
            </FormField>
          )}
          <FormField
            id="novelty-type"
            label="Tipo"
            error={errors.noveltyTypeId?.message}
            hint={type ? CONCEPT_NATURE_LABELS[type.nature] : undefined}
            required
          >
            <Select {...fieldA11y("novelty-type", errors.noveltyTypeId?.message)} {...form.register("noveltyTypeId")}>
              <option value="">Elegí el tipo…</option>
              {available.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.isActive ? "" : " (inactivo)"}
                </option>
              ))}
            </Select>
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField id="novelty-date" label="Fecha" error={errors.date?.message} required>
              <Input {...fieldA11y("novelty-date", errors.date?.message)} type="date" {...form.register("date")} />
            </FormField>
            <FormField
              id="novelty-period"
              label="Período"
              error={errors.period?.message}
              hint="Mes de liquidación."
              required
            >
              <Input
                {...fieldA11y("novelty-period", errors.period?.message)}
                type="month"
                {...form.register("period")}
              />
            </FormField>
            <FormField
              id="novelty-quantity"
              label={type?.quantityUnit ? `Cantidad (${type.quantityUnit})` : "Cantidad"}
              error={errors.quantity?.message}
              required={!!type?.requiresQuantity}
            >
              <Input
                {...fieldA11y("novelty-quantity", errors.quantity?.message)}
                inputMode="decimal"
                {...form.register("quantity")}
              />
            </FormField>
            <FormField
              id="novelty-amount"
              label="Importe"
              error={errors.amount?.message}
              required={!!type?.requiresAmount}
            >
              <Input
                {...fieldA11y("novelty-amount", errors.amount?.message)}
                inputMode="decimal"
                placeholder="0,00"
                {...form.register("amount")}
              />
            </FormField>
          </div>
          <FormField id="novelty-notes" label="Observaciones" error={errors.notes?.message}>
            <Textarea {...fieldA11y("novelty-notes", errors.notes?.message)} rows={2} {...form.register("notes")} />
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

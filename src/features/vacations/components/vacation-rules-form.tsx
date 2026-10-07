"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { applyActionErrors } from "@/components/forms/action-errors";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveVacationRulesAction } from "../actions";
import { vacationRulesSchema } from "../schemas";

type Row = { minSeniorityYears: string; maxSeniorityYears: string; days: string };
type Values = { rules: Row[] };

/**
 * Tabla de días de vacaciones por antigüedad. Cada fila vale para "más de
 * desde y hasta tope" años; la primera empieza en 0 y la última no tiene tope.
 */
export function VacationRulesForm({ rules }: { rules: Row[] }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const initial: Values = {
    rules: rules.length > 0 ? rules : [{ minSeniorityYears: "0", maxSeniorityYears: "", days: "" }],
  };
  const form = useForm<Values>({
    resolver: zodResolver(vacationRulesSchema) as never,
    defaultValues: initial,
    mode: "onSubmit",
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "rules" });
  const { errors, isDirty } = form.formState;

  const addRow = () => {
    const rows = form.getValues("rules");
    const last = rows.at(-1);
    append({ minSeniorityYears: last?.maxSeniorityYears || "", maxSeniorityYears: "", days: "" });
  };

  const submit = form.handleSubmit((values) => {
    setFormError(undefined);
    startTransition(async () => {
      const result = await saveVacationRulesAction(values);
      if (!result.ok) {
        setFormError(applyActionErrors<Values>(result.error, form.setError));
        return;
      }
      toast.success("Reglas guardadas");
      form.reset(form.getValues());
      router.refresh();
    });
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      {formError && <Alert variant="destructive">{formError}</Alert>}
      {errors.rules?.root?.message && <Alert variant="destructive">{errors.rules.root.message}</Alert>}
      <div className="text-muted-foreground hidden grid-cols-[1fr_1fr_1fr_auto] gap-2 text-xs font-medium sm:grid">
        <span>Más de (años)</span>
        <span>Hasta (años, inclusive)</span>
        <span>Días de vacaciones</span>
        <span className="w-9" />
      </div>
      {fields.map((field, index) => {
        const rowErrors = errors.rules?.[index];
        const message =
          rowErrors?.minSeniorityYears?.message ?? rowErrors?.maxSeniorityYears?.message ?? rowErrors?.days?.message;
        const last = index === fields.length - 1;
        return (
          <div key={field.id} className="flex flex-col gap-1 rounded-md border p-2 sm:border-0 sm:p-0">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <Input
                aria-label={`Regla ${index + 1}: más de (años)`}
                aria-invalid={rowErrors?.minSeniorityYears ? true : undefined}
                inputMode="numeric"
                {...form.register(`rules.${index}.minSeniorityYears`)}
              />
              <Input
                aria-label={`Regla ${index + 1}: hasta (años)`}
                aria-invalid={rowErrors?.maxSeniorityYears ? true : undefined}
                inputMode="numeric"
                placeholder={last ? "Sin tope" : undefined}
                {...form.register(`rules.${index}.maxSeniorityYears`)}
              />
              <Input
                aria-label={`Regla ${index + 1}: días`}
                aria-invalid={rowErrors?.days ? true : undefined}
                inputMode="numeric"
                {...form.register(`rules.${index}.days`)}
              />
              <Button
                variant="ghost"
                size="icon"
                className="col-span-3 justify-self-end sm:col-span-1"
                aria-label={`Quitar la regla ${index + 1}`}
                disabled={fields.length === 1}
                onClick={() => remove(index)}
              >
                <Trash2 />
              </Button>
            </div>
            {message && <p className="text-destructive text-xs">{message}</p>}
          </div>
        );
      })}
      <div className="flex flex-wrap justify-between gap-2 pt-2">
        <Button variant="outline" onClick={addRow} disabled={fields.length >= 20}>
          <Plus /> Agregar regla
        </Button>
        <Button type="submit" disabled={pending || !isDirty}>
          {pending ? "Guardando…" : "Guardar reglas"}
        </Button>
      </div>
    </form>
  );
}

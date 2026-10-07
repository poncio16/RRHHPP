"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, UserMinus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
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
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createExitAction, updateExitAction } from "../actions";
import { exitEmployeeSchema, exitSchema } from "../schemas";
import type { ExitOption } from "../service";

type Values = {
  employeeId: string;
  exitDate: string;
  exitTypeId: string;
  exitReasonId: string;
  notes: string;
  confirm: boolean;
};

const withEmployeeSchema = exitSchema.and(exitEmployeeSchema);

/** Muestra los avisos que devuelve la confirmación (no bloquean). */
export function showExitWarnings(warnings: string[]) {
  for (const warning of warnings) toast.warning(warning, { duration: 10000 });
}

/**
 * Alta o modificación de un egreso. Se registra en trámite; si la fecha ya
 * llegó, se puede confirmar en el mismo paso. Del egreso confirmado solo se
 * corrigen tipo, motivo y observaciones.
 */
export function ExitDialog({
  employeeId,
  employees,
  types,
  reasons,
  today,
  record,
  triggerLabel = "Registrar egreso",
  triggerVariant = "default",
}: {
  employeeId: string | null;
  employees?: { id: string; label: string }[];
  types: ExitOption[];
  reasons: ExitOption[];
  today: string;
  record?: {
    id: string;
    version: string;
    title: string;
    confirmed: boolean;
    values: Omit<Values, "employeeId" | "confirm">;
  };
  triggerLabel?: string;
  triggerVariant?: "default" | "outline";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const pickEmployee = !employeeId && !record;
  const initial: Values = record
    ? { ...record.values, employeeId: employeeId ?? "", confirm: false }
    : { employeeId: employeeId ?? "", exitDate: today, exitTypeId: "", exitReasonId: "", notes: "", confirm: false };
  const form = useForm<Values>({
    resolver: zodResolver(pickEmployee ? withEmployeeSchema : exitSchema) as never,
    defaultValues: initial,
    mode: "onSubmit",
  });
  const { errors, isDirty } = form.formState;
  const exitDate = useWatch({ control: form.control, name: "exitDate" });
  const confirm = useWatch({ control: form.control, name: "confirm" });
  const future = !!exitDate && exitDate > today;
  const activeOnly = (options: ExitOption[], current?: string) => options.filter((o) => o.isActive || o.id === current);

  const reset = () => {
    form.reset(initial);
    setFormError(undefined);
  };

  const submit = form.handleSubmit((values) => {
    setFormError(undefined);
    startTransition(async () => {
      const payload = { ...values, confirm: !record && values.confirm && !future, version: record?.version ?? null };
      if (record) {
        const result = await updateExitAction(record.id, payload);
        if (!result.ok) {
          setFormError(applyActionErrors<Values>(result.error, form.setError));
          return;
        }
        toast.success("Egreso modificado");
      } else {
        const result = await createExitAction(employeeId, payload);
        if (!result.ok) {
          setFormError(applyActionErrors<Values>(result.error, form.setError));
          return;
        }
        if (result.data.confirmed) {
          toast.success("Egreso confirmado: el empleado figura como egresado");
          showExitWarnings(result.data.warnings);
        } else toast.success("Egreso registrado en trámite");
      }
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
          <Button variant="ghost" size="icon" aria-label={`Modificar ${record.title}`} title="Modificar">
            <Pencil />
          </Button>
        ) : (
          <Button variant={triggerVariant}>
            <UserMinus /> {triggerLabel}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{record ? "Modificar egreso" : "Registrar egreso"}</DialogTitle>
          <DialogDescription>
            {record
              ? `${record.title}.${record.confirmed ? " Está confirmado: para cambiar la fecha hay que anularlo." : ""}`
              : "El legajo no se borra: queda como egresado al confirmar el egreso, con todo su historial."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {formError && <Alert variant="destructive">{formError}</Alert>}
          {pickEmployee && (
            <FormField id="exit-employee" label="Empleado" error={errors.employeeId?.message} required>
              <Select {...fieldA11y("exit-employee", errors.employeeId?.message)} {...form.register("employeeId")}>
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
            id="exit-date"
            label="Fecha de egreso"
            error={errors.exitDate?.message}
            hint="Último día de trabajo."
            required
          >
            <Input
              {...fieldA11y("exit-date", errors.exitDate?.message)}
              type="date"
              readOnly={record?.confirmed}
              {...form.register("exitDate")}
            />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="exit-type" label="Tipo de egreso" error={errors.exitTypeId?.message} required>
              <Select {...fieldA11y("exit-type", errors.exitTypeId?.message)} {...form.register("exitTypeId")}>
                <option value="">Elegí el tipo…</option>
                {activeOnly(types, record?.values.exitTypeId).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                    {t.isActive ? "" : " (inactivo)"}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField id="exit-reason" label="Motivo" error={errors.exitReasonId?.message} required>
              <Select {...fieldA11y("exit-reason", errors.exitReasonId?.message)} {...form.register("exitReasonId")}>
                <option value="">Elegí el motivo…</option>
                {activeOnly(reasons, record?.values.exitReasonId).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                    {r.isActive ? "" : " (inactivo)"}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <FormField id="exit-notes" label="Observaciones" error={errors.notes?.message}>
            <Textarea {...fieldA11y("exit-notes", errors.notes?.message)} rows={3} {...form.register("notes")} />
          </FormField>
          {!record && (
            <label className="flex items-start gap-2 text-sm">
              <Checkbox className="mt-0.5" disabled={future} {...form.register("confirm")} />
              <span>
                Confirmar el egreso ahora
                <span className="text-muted-foreground block text-xs">
                  {future
                    ? "La fecha todavía no llegó: queda en trámite y se confirma a partir de ese día."
                    : "El empleado pasa a egresado. Si no, queda en trámite para confirmarlo después."}
                </span>
              </span>
            </label>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || (!!record && !isDirty)}>
              {pending
                ? "Guardando…"
                : record
                  ? "Guardar cambios"
                  : confirm && !future
                    ? "Registrar y confirmar"
                    : "Registrar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

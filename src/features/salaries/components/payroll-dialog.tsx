"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Calculator, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
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
import { normalizeDecimal } from "@/lib/validators/decimal";
import { createPayrollAction, updatePayrollAction } from "../actions";
import { payrollWarnings } from "../calc";
import { MAX_PAYROLL_LINES, SALARY_DISCLAIMER } from "../constants";
import { payrollEmployeeSchema, payrollRecordSchema } from "../schemas";
import type { ConceptOption } from "../service";

type Line = { conceptTypeId: string; description: string; quantity: string; amount: string };
type Values = {
  employeeId: string;
  period: string;
  grossReported: string;
  deductionsReported: string;
  netReported: string;
  notes: string;
  lines: Line[];
};

const withEmployeeSchema = payrollRecordSchema.and(payrollEmployeeSchema);
const EMPTY_LINE: Line = { conceptTypeId: "", description: "", quantity: "", amount: "" };
/** Importe escrito → número para los controles (0 si todavía no es válido). */
const toNumber = (value: string) => Number(normalizeDecimal(value ?? "") ?? 0);
const input = (n: number) => n.toFixed(2).replace(".", ",");

/**
 * Carga o modificación del resumen mensual informado por el sistema de
 * liquidación: totales y, opcionalmente, los renglones por concepto.
 * Las diferencias entre totales y renglones se avisan pero no bloquean.
 */
export function PayrollDialog({
  employeeId,
  employees,
  concepts,
  defaultPeriod,
  maxPeriod,
  record,
}: {
  employeeId: string | null;
  employees?: { id: string; label: string }[];
  concepts: ConceptOption[];
  defaultPeriod: string;
  /** Último período admitido (AAAA-MM): el mes en curso. */
  maxPeriod: string;
  record?: { id: string; version: string; title: string; values: Omit<Values, "employeeId"> };
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
        period: defaultPeriod,
        grossReported: "",
        deductionsReported: "",
        netReported: "",
        notes: "",
        lines: [],
      };
  const form = useForm<Values>({
    resolver: zodResolver(pickEmployee ? withEmployeeSchema : payrollRecordSchema) as never,
    defaultValues: initial,
    mode: "onSubmit",
  });
  const { errors, isDirty } = form.formState;
  const lines = useFieldArray({ control: form.control, name: "lines" });
  const watched = useWatch({ control: form.control });
  const natureOf = (id: string) => concepts.find((c) => c.id === id)?.nature ?? "INFORMATIVO";

  const watchedLines = (watched.lines ?? []).filter((l): l is Line => !!l && !!l.conceptTypeId);
  const sum = (nature: string) =>
    watchedLines.filter((l) => natureOf(l.conceptTypeId) === nature).reduce((acc, l) => acc + toNumber(l.amount), 0);
  const totalsReady = [watched.grossReported, watched.deductionsReported, watched.netReported].every(
    (v) => !!v && normalizeDecimal(v) !== null,
  );
  const warnings = totalsReady
    ? payrollWarnings({
        gross: normalizeDecimal(watched.grossReported!)!,
        deductions: normalizeDecimal(watched.deductionsReported!)!,
        net: normalizeDecimal(watched.netReported!)!,
        lines: watchedLines
          .filter((l) => normalizeDecimal(l.amount) !== null)
          .map((l) => ({ nature: natureOf(l.conceptTypeId), amount: normalizeDecimal(l.amount)! })),
      })
    : [];

  /** Completa bruto, descuentos y neto con las sumas de los renglones. */
  const fillFromLines = () => {
    const gross = sum("HABER");
    const deductions = sum("DESCUENTO");
    const options = { shouldDirty: true, shouldValidate: true };
    form.setValue("grossReported", input(gross), options);
    form.setValue("deductionsReported", input(deductions), options);
    form.setValue("netReported", input(Math.round((gross - deductions) * 100) / 100), options);
  };

  const reset = () => {
    form.reset(initial);
    setFormError(undefined);
  };

  const submit = form.handleSubmit((values) => {
    setFormError(undefined);
    startTransition(async () => {
      const payload = { ...values, version: record?.version ?? null };
      const result = record
        ? await updatePayrollAction(record.id, payload)
        : await createPayrollAction(employeeId, payload);
      if (!result.ok) {
        setFormError(applyActionErrors<Values>(result.error, form.setError));
        return;
      }
      if (result.data.warnings.length > 0) {
        toast.warning("Resumen guardado con diferencias", { description: result.data.warnings.join(" ") });
      } else {
        toast.success(record ? "Se modificó el resumen" : "Se cargó el resumen");
      }
      setOpen(false);
      reset();
      router.refresh();
    });
  });

  const activeConcepts = (current: string) => concepts.filter((c) => c.isActive || c.id === current);

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
            <Plus /> Cargar resumen
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{record ? "Modificar resumen informado" : "Cargar resumen informado"}</DialogTitle>
          <DialogDescription>{record ? record.title : SALARY_DISCLAIMER}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {formError && <Alert variant="destructive">{formError}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            {pickEmployee && (
              <FormField id="payroll-employee" label="Empleado" error={errors.employeeId?.message} required>
                <Select {...fieldA11y("payroll-employee", errors.employeeId?.message)} {...form.register("employeeId")}>
                  <option value="">Elegí un empleado…</option>
                  {(employees ?? []).map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.label}
                    </option>
                  ))}
                </Select>
              </FormField>
            )}
            <FormField id="payroll-period" label="Período" error={errors.period?.message} required>
              <Input
                {...fieldA11y("payroll-period", errors.period?.message)}
                type="month"
                max={maxPeriod}
                {...form.register("period")}
              />
            </FormField>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Conceptos (opcional)</legend>
            {lines.fields.length === 0 && (
              <p className="text-muted-foreground text-xs">
                Podés cargar solo los totales, o los renglones del recibo para tener el detalle.
              </p>
            )}
            {lines.fields.map((field, i) => {
              const lineErrors = errors.lines?.[i];
              const current = watched.lines?.[i]?.conceptTypeId ?? "";
              const n = i + 1;
              return (
                <div
                  key={field.id}
                  className="grid grid-cols-2 gap-2 rounded-md border p-2 sm:grid-cols-[minmax(10rem,1.3fr)_minmax(8rem,1fr)_5rem_8rem_auto] sm:items-start sm:border-0 sm:p-0"
                >
                  <div className="col-span-2 sm:col-span-1">
                    <Select
                      aria-label={`Concepto del renglón ${n}`}
                      aria-invalid={lineErrors?.conceptTypeId ? true : undefined}
                      {...form.register(`lines.${i}.conceptTypeId`)}
                    >
                      <option value="">Concepto…</option>
                      {activeConcepts(current).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                          {c.isActive ? "" : " (inactivo)"}
                        </option>
                      ))}
                    </Select>
                    {lineErrors?.conceptTypeId && (
                      <p className="text-destructive mt-1 text-xs">{lineErrors.conceptTypeId.message}</p>
                    )}
                  </div>
                  <Input
                    className="col-span-2 sm:col-span-1"
                    aria-label={`Detalle del renglón ${n}`}
                    placeholder="Detalle"
                    maxLength={120}
                    {...form.register(`lines.${i}.description`)}
                  />
                  <div>
                    <Input
                      aria-label={`Cantidad del renglón ${n}`}
                      aria-invalid={lineErrors?.quantity ? true : undefined}
                      inputMode="decimal"
                      placeholder="Cant."
                      {...form.register(`lines.${i}.quantity`)}
                    />
                    {lineErrors?.quantity && (
                      <p className="text-destructive mt-1 text-xs">{lineErrors.quantity.message}</p>
                    )}
                  </div>
                  <div>
                    <Input
                      aria-label={`Importe del renglón ${n}`}
                      aria-invalid={lineErrors?.amount ? true : undefined}
                      inputMode="decimal"
                      placeholder="Importe"
                      {...form.register(`lines.${i}.amount`)}
                    />
                    {lineErrors?.amount && <p className="text-destructive mt-1 text-xs">{lineErrors.amount.message}</p>}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="col-span-2 justify-self-end sm:col-span-1"
                    aria-label={`Quitar el renglón ${n}`}
                    onClick={() => lines.remove(i)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              );
            })}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={lines.fields.length >= MAX_PAYROLL_LINES}
                onClick={() => lines.append(EMPTY_LINE)}
              >
                <Plus /> Agregar concepto
              </Button>
              {watchedLines.length > 0 && (
                <Button type="button" variant="outline" size="sm" onClick={fillFromLines}>
                  <Calculator /> Completar totales con los conceptos
                </Button>
              )}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-3">
            <FormField id="payroll-gross" label="Bruto informado" error={errors.grossReported?.message} required>
              <Input
                {...fieldA11y("payroll-gross", errors.grossReported?.message)}
                inputMode="decimal"
                placeholder="0,00"
                {...form.register("grossReported")}
              />
            </FormField>
            <FormField
              id="payroll-deductions"
              label="Descuentos informados"
              error={errors.deductionsReported?.message}
              required
            >
              <Input
                {...fieldA11y("payroll-deductions", errors.deductionsReported?.message)}
                inputMode="decimal"
                placeholder="0,00"
                {...form.register("deductionsReported")}
              />
            </FormField>
            <FormField id="payroll-net" label="Neto informado" error={errors.netReported?.message} required>
              <Input
                {...fieldA11y("payroll-net", errors.netReported?.message)}
                inputMode="decimal"
                placeholder="0,00"
                {...form.register("netReported")}
              />
            </FormField>
          </div>
          {warnings.length > 0 && (
            <Alert variant="warning" className="text-sm">
              <p className="font-medium">Revisá estas diferencias (se puede guardar igual):</p>
              <ul className="mt-1 list-disc pl-5">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </Alert>
          )}
          <FormField id="payroll-notes" label="Observaciones" error={errors.notes?.message}>
            <Textarea {...fieldA11y("payroll-notes", errors.notes?.message)} rows={2} {...form.register("notes")} />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || (!!record && !isDirty)}>
              {pending ? "Guardando…" : record ? "Guardar cambios" : "Guardar resumen"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

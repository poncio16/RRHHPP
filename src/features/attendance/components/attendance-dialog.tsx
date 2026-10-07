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
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { previewAttendanceDayAction, saveAttendanceDayAction } from "../actions";
import { attendanceDaySchema, attendanceEmployeeSchema } from "../schemas";

type Values = {
  employeeId: string;
  date: string;
  checkIn: string;
  checkOut: string;
  breakMinutes: string;
  notes: string;
};

type Preview = {
  plan: string;
  status: string | null;
  worked: string | null;
  regular: string | null;
  extra: string | null;
  late: number;
  problems: string[];
} | null;

const withEmployeeSchema = attendanceDaySchema.and(attendanceEmployeeSchema);

/**
 * Alta o corrección de la asistencia de un día. Sin `employeeId` (listado
 * general) se elige el empleado. Mientras se completa muestra qué se esperaba
 * ese día y las horas que se van a calcular.
 */
export function AttendanceDialog({
  employeeId,
  employees,
  today,
  record,
}: {
  employeeId: string | null;
  employees?: { id: string; label: string }[];
  /** Fecha de hoy (AAAA-MM-DD), tope del calendario. */
  today: string;
  record?: { version: string; title: string; values: Omit<Values, "employeeId"> };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [preview, setPreview] = useState<Preview>(null);
  const [pending, startTransition] = useTransition();
  const [, startPreview] = useTransition();
  const pickEmployee = !employeeId && !record;
  const initial: Values = record
    ? { ...record.values, employeeId: employeeId ?? "" }
    : { employeeId: employeeId ?? "", date: today, checkIn: "", checkOut: "", breakMinutes: "", notes: "" };
  const form = useForm<Values>({
    resolver: zodResolver(pickEmployee ? withEmployeeSchema : attendanceDaySchema) as never,
    defaultValues: initial,
    mode: "onSubmit",
  });
  const { errors, isDirty } = form.formState;

  /** Clave de los datos del cálculo; una respuesta vieja se descarta si cambiaron. */
  const key = () => {
    const v = form.getValues();
    return [employeeId ?? v.employeeId, v.date, v.checkIn, v.checkOut, v.breakMinutes].join("|");
  };

  const refresh = () => {
    const values = form.getValues();
    const target = employeeId ?? values.employeeId;
    if (!target || !values.date) {
      setPreview(null);
      return;
    }
    const before = key();
    startPreview(async () => {
      const result = await previewAttendanceDayAction(target, values);
      if (before === key()) setPreview(result.ok ? result.data : null);
    });
  };

  const reset = () => {
    form.reset(initial);
    setFormError(undefined);
    setPreview(null);
  };

  const submit = form.handleSubmit((values) => {
    setFormError(undefined);
    startTransition(async () => {
      const result = await saveAttendanceDayAction(employeeId ?? values.employeeId, {
        ...values,
        version: record?.version ?? null,
      });
      if (!result.ok) {
        setFormError(applyActionErrors<Values>(result.error, form.setError));
        return;
      }
      toast.success(`Asistencia guardada: ${result.data.status.toLowerCase()}`);
      setOpen(false);
      reset();
      router.refresh();
    });
  });

  const watched = (name: keyof Values) => form.register(name, { onChange: refresh });

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) refresh();
        else reset();
      }}
    >
      <DialogTrigger asChild>
        {record ? (
          <Button variant="ghost" size="icon" aria-label={`Editar ${record.title}`}>
            <Pencil />
          </Button>
        ) : (
          <Button>
            <Plus /> Registrar día
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{record ? "Corregir asistencia" : "Registrar asistencia"}</DialogTitle>
          <DialogDescription>
            {record
              ? record.title
              : "Entrada y salida del día. Sin horas, el día queda como ausente, franco o feriado según el horario."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {formError && <Alert variant="destructive">{formError}</Alert>}
          {pickEmployee && (
            <FormField id="attendance-employee" label="Empleado" error={errors.employeeId?.message} required>
              <Select {...fieldA11y("attendance-employee", errors.employeeId?.message)} {...watched("employeeId")}>
                <option value="">Elegí un empleado…</option>
                {(employees ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </Select>
            </FormField>
          )}
          <FormField id="attendance-date" label="Fecha" error={errors.date?.message} required>
            <Input
              {...fieldA11y("attendance-date", errors.date?.message)}
              type="date"
              max={today}
              readOnly={!!record}
              {...watched("date")}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <FormField id="attendance-in" label="Entrada" error={errors.checkIn?.message}>
              <Input {...fieldA11y("attendance-in", errors.checkIn?.message)} type="time" {...watched("checkIn")} />
            </FormField>
            <FormField id="attendance-out" label="Salida" error={errors.checkOut?.message}>
              <Input {...fieldA11y("attendance-out", errors.checkOut?.message)} type="time" {...watched("checkOut")} />
            </FormField>
            <FormField
              id="attendance-break"
              label="Descanso (min)"
              error={errors.breakMinutes?.message}
              className="col-span-2 sm:col-span-1"
            >
              <Input
                {...fieldA11y("attendance-break", errors.breakMinutes?.message)}
                inputMode="numeric"
                placeholder="El del horario"
                {...watched("breakMinutes")}
              />
            </FormField>
          </div>
          {preview && (
            <div className="bg-muted/50 rounded-md border p-3 text-sm" aria-live="polite">
              <p>
                <span className="text-muted-foreground">Horario del día:</span> {preview.plan}
              </p>
              {preview.status && (
                <p className="font-medium">
                  {preview.status}
                  {preview.worked &&
                    ` · ${preview.worked} h trabajadas (${preview.regular} normales, ${preview.extra} adicionales)`}
                  {preview.late > 0 && ` · ${preview.late} min tarde`}
                </p>
              )}
              {preview.problems.map((message) => (
                <p key={message} className="text-destructive mt-1 text-xs">
                  {message}
                </p>
              ))}
            </div>
          )}
          <FormField id="attendance-notes" label="Observaciones" error={errors.notes?.message}>
            <Textarea {...fieldA11y("attendance-notes", errors.notes?.message)} rows={2} {...form.register("notes")} />
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

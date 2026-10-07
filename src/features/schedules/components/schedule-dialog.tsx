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
import { createScheduleAction, updateScheduleAction } from "../actions";
import { DAY_NAMES, weeklyHours } from "../calc";
import { scheduleSchema } from "../schemas";

type Day = { dayOfWeek: number; enabled: boolean; startTime: string; endTime: string; breakMinutes: number };
type Values = { name: string; workModalityId: string; days: Day[] };
type Option = { id: string; label: string; isActive: boolean };

const EMPTY: Values = {
  name: "",
  workModalityId: "",
  days: Array.from({ length: 7 }, (_, i) => ({
    dayOfWeek: i + 1,
    enabled: i < 5,
    startTime: i < 5 ? "09:00" : "",
    endTime: i < 5 ? "18:00" : "",
    breakMinutes: i < 5 ? 60 : 0,
  })),
};

/** Alta (sin `schedule`) o edición de un horario semanal. */
export function ScheduleDialog({
  schedule,
  modalities,
}: {
  schedule?: { id: string; values: Values };
  modalities: Option[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const initial = schedule?.values ?? EMPTY;
  const form = useForm<Values>({
    resolver: zodResolver(scheduleSchema) as never,
    defaultValues: initial,
    mode: "onBlur",
  });
  const { errors, isDirty } = form.formState;
  const days = useWatch({ control: form.control, name: "days" });
  const prefix = schedule ? `schedule-${schedule.id}` : "schedule-new";
  const total = weeklyHours(
    days.filter((d) => d.enabled).map((d) => ({ ...d, breakMinutes: Number(d.breakMinutes) || 0 })),
  );

  const submit = form.handleSubmit((values) => {
    setFormError(undefined);
    startTransition(async () => {
      const result = schedule ? await updateScheduleAction(schedule.id, values) : await createScheduleAction(values);
      if (!result.ok) {
        setFormError(applyActionErrors(result.error, form.setError));
        return;
      }
      toast.success(schedule ? "Horario actualizado" : "Horario creado");
      setOpen(false);
      form.reset(schedule ? values : EMPTY);
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
        {schedule ? (
          <Button variant="ghost" size="icon" aria-label={`Editar ${schedule.values.name}`}>
            <Pencil />
          </Button>
        ) : (
          <Button>
            <Plus /> Nuevo horario
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{schedule ? "Editar horario" : "Nuevo horario"}</DialogTitle>
          <DialogDescription>
            Días y horas de trabajo de la semana. Las horas semanales se calculan solas.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {formError && <Alert variant="destructive">{formError}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id={`${prefix}-name`} label="Nombre" error={errors.name?.message} required>
              <Input
                {...fieldA11y(`${prefix}-name`, errors.name?.message)}
                autoComplete="off"
                placeholder="Por ejemplo, Administración L a V"
                {...form.register("name")}
              />
            </FormField>
            <FormField id={`${prefix}-modality`} label="Modalidad" error={errors.workModalityId?.message}>
              <Select {...fieldA11y(`${prefix}-modality`)} {...form.register("workModalityId")}>
                <option value="">Sin asignar</option>
                {modalities.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                    {o.isActive ? "" : " (inactivo)"}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Días de trabajo</legend>
            <div className="text-muted-foreground hidden grid-cols-[8rem_1fr_1fr_1fr] gap-2 text-xs sm:grid">
              <span>Día</span>
              <span>Entrada</span>
              <span>Salida</span>
              <span>Descanso (min)</span>
            </div>
            {DAY_NAMES.map((dayName, i) => {
              const enabled = days[i]?.enabled;
              const dayErrors = errors.days?.[i];
              const id = `${prefix}-day-${i + 1}`;
              return (
                <div key={dayName} className="grid grid-cols-3 items-start gap-2 sm:grid-cols-[8rem_1fr_1fr_1fr]">
                  <label htmlFor={id} className="col-span-3 flex h-9 items-center gap-2 text-sm sm:col-span-1">
                    <Checkbox id={id} {...form.register(`days.${i}.enabled`)} />
                    {dayName}
                  </label>
                  {enabled ? (
                    <>
                      <TimeCell
                        label={`Entrada ${dayName}`}
                        error={dayErrors?.startTime?.message}
                        {...form.register(`days.${i}.startTime`)}
                      />
                      <TimeCell
                        label={`Salida ${dayName}`}
                        error={dayErrors?.endTime?.message}
                        {...form.register(`days.${i}.endTime`)}
                      />
                      <div className="flex flex-col gap-1">
                        <Input
                          type="number"
                          min={0}
                          step={5}
                          inputMode="numeric"
                          aria-label={`Descanso ${dayName} en minutos`}
                          aria-invalid={dayErrors?.breakMinutes ? true : undefined}
                          {...form.register(`days.${i}.breakMinutes`, { valueAsNumber: true })}
                        />
                        {dayErrors?.breakMinutes && (
                          <p className="text-destructive text-xs">{dayErrors.breakMinutes.message}</p>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="text-muted-foreground col-span-3 hidden h-9 items-center text-sm sm:flex">
                      No trabaja
                    </p>
                  )}
                </div>
              );
            })}
            {errors.days?.root?.message || errors.days?.message ? (
              <p className="text-destructive text-xs">{errors.days?.root?.message ?? errors.days?.message}</p>
            ) : null}
            <p className="text-muted-foreground text-sm">
              Total: <span className="text-foreground font-medium">{total.replace(".", ",")} horas semanales</span>.
              Horas en formato de 24 h (por ejemplo, 18:30); si la salida es anterior a la entrada, el turno termina al
              día siguiente.
            </p>
          </fieldset>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || (!!schedule && !isDirty)}>
              {pending ? "Guardando…" : schedule ? "Guardar cambios" : "Crear horario"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TimeCell({ label, error, ...props }: { label: string; error?: string } & React.ComponentProps<"input">) {
  return (
    <div className="flex flex-col gap-1">
      <Input
        inputMode="numeric"
        placeholder="HH:MM"
        maxLength={5}
        autoComplete="off"
        aria-label={label}
        aria-invalid={error ? true : undefined}
        {...props}
      />
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}

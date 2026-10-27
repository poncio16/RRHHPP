"use client";

import type { UseFormRegisterReturn } from "react-hook-form";
import { fieldA11y } from "@/components/forms/form-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Errors = { registration?: string; registeredSince?: string; unregisteredSince?: string };

/**
 * Con registro / sin registro, cada opción con su fecha al lado. La fecha de
 * "con registro" es la de alta en ARCA. Se usa en el formulario del legajo y
 * en el diálogo del encabezado.
 */
export function RegistrationFields({
  idPrefix,
  value,
  register,
  errors,
  emptyHint,
}: {
  idPrefix: string;
  value: string | undefined;
  register: {
    registration: UseFormRegisterReturn;
    registeredSince: UseFormRegisterReturn;
    unregisteredSince: UseFormRegisterReturn;
  };
  errors: Errors;
  /** Qué pasa si la fecha del estado elegido queda vacía. */
  emptyHint?: string;
}) {
  const options = [
    {
      value: "CON_REGISTRO",
      label: "Con registro",
      date: "registeredSince" as const,
      dateLabel: "Fecha de alta en ARCA",
      hint: "La misma del alta como empleado en ARCA.",
    },
    {
      value: "SIN_REGISTRO",
      label: "Sin registro",
      date: "unregisteredSince" as const,
      dateLabel: "Sin registro desde",
      hint: "Desde cuándo trabaja sin registrar.",
    },
  ];
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-sm font-medium">Registro</legend>
      {options.map((o) => {
        const radioId = `${idPrefix}-${o.value}`;
        const dateId = `${idPrefix}-${o.date}`;
        const error = errors[o.date];
        const selected = value === o.value;
        return (
          <div
            key={o.value}
            className={cn(
              "grid gap-2 rounded-md border p-3 sm:grid-cols-[10rem_1fr] sm:items-start",
              selected && "border-primary/50 bg-primary/5",
            )}
          >
            <label htmlFor={radioId} className="flex items-center gap-2 text-sm font-medium sm:pt-7">
              <input
                id={radioId}
                type="radio"
                value={o.value}
                className="accent-primary size-4"
                {...register.registration}
              />
              {o.label}
            </label>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={dateId}>{o.dateLabel}</Label>
              <Input {...fieldA11y(dateId, error)} type="date" {...register[o.date]} />
              {error ? (
                <p id={`${dateId}-error`} className="text-destructive text-xs">
                  {error}
                </p>
              ) : (
                <p className="text-muted-foreground text-xs">
                  {o.hint}
                  {selected && emptyHint ? ` ${emptyHint}` : ""}
                </p>
              )}
            </div>
          </div>
        );
      })}
      {errors.registration && <p className="text-destructive text-xs">{errors.registration}</p>}
    </fieldset>
  );
}

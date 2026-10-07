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
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { balanceOptionsAction, createLeaveAction, previewLeaveAction, updateLeaveAction } from "../actions";
import { LEAVE_CLASS_LABELS, LEAVE_CLASSES, type LeaveClass } from "../constants";
import { leaveEmployeeSchema, leaveSchema } from "../schemas";

type Values = {
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  vacationBalanceId: string;
  notes: string;
};

export type LeaveTypeChoice = {
  id: string;
  name: string;
  class: string;
  isActive: boolean;
  requiresCertificate: boolean;
};
type BalanceChoice = { id: string; label: string; available: number };
type Preview = { days: number; countingMode: string; problems: string[]; warnings: string[] } | null;

const EMPTY: Values = { employeeId: "", leaveTypeId: "", startDate: "", endDate: "", vacationBalanceId: "", notes: "" };
const withEmployeeSchema = leaveSchema.and(leaveEmployeeSchema);

/**
 * Alta o edición de una licencia, ausencia, vacaciones o suspensión. Sin
 * `employeeId` (listados generales) se elige el empleado. Mientras se completa
 * muestra los días que se van a contar y los avisos.
 */
export function LeaveDialog({
  employeeId,
  employees,
  types,
  canApprove,
  defaultClass,
  leave,
}: {
  employeeId: string | null;
  employees?: { id: string; label: string }[];
  types: LeaveTypeChoice[];
  canApprove: boolean;
  /** Clase sugerida al abrir (por ejemplo, Vacaciones desde ese módulo). */
  defaultClass?: LeaveClass;
  leave?: { id: string; version: string; title: string; status: string; values: Omit<Values, "employeeId"> };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [approve, setApprove] = useState(false);
  const [balances, setBalances] = useState<BalanceChoice[] | null>(null);
  const [preview, setPreview] = useState<Preview>(null);
  const [pending, startTransition] = useTransition();
  const [, startPreview] = useTransition();
  const pickEmployee = !employeeId && !leave;
  const defaultType =
    !leave && defaultClass ? (types.find((t) => t.isActive && t.class === defaultClass)?.id ?? "") : "";
  const initial: Values = leave
    ? { ...EMPTY, ...leave.values, employeeId: employeeId ?? "" }
    : { ...EMPTY, employeeId: employeeId ?? "", leaveTypeId: defaultType };
  const form = useForm<Values>({
    resolver: zodResolver(pickEmployee ? withEmployeeSchema : leaveSchema) as never,
    defaultValues: initial,
    mode: "onBlur",
  });
  const { errors, isDirty } = form.formState;
  const typeId = useWatch({ control: form.control, name: "leaveTypeId" });
  // Controlado: el período sugerido llega junto con sus opciones y el select
  // no controlado no puede tomar un valor que todavía no tiene como opción.
  const balanceId = useWatch({ control: form.control, name: "vacationBalanceId" });
  const type = types.find((t) => t.id === typeId);
  const isVacation = type?.class === "VACACIONES";
  const visibleTypes = types.filter((t) => t.isActive || t.id === leave?.values.leaveTypeId);

  /** Clave de los datos que definen el cálculo; una respuesta vieja se descarta si cambiaron. */
  const previewKey = () => {
    const v = form.getValues();
    return [employeeId ?? v.employeeId, v.leaveTypeId, v.startDate, v.endDate, v.vacationBalanceId].join("|");
  };

  /** Los períodos de vacaciones dependen solo del empleado y del tipo. */
  const employeeKey = () => {
    const v = form.getValues();
    return [employeeId ?? v.employeeId, v.leaveTypeId].join("|");
  };

  /** Recalcula días y avisos, y trae los períodos de vacaciones si hacen falta. */
  const refresh = () => {
    const values = form.getValues();
    const target = employeeId ?? values.employeeId;
    const selected = types.find((t) => t.id === values.leaveTypeId);
    startPreview(async () => {
      if (selected?.class === "VACACIONES" && target) {
        const before = employeeKey();
        const result = await balanceOptionsAction(target, leave?.id ?? null);
        if (before !== employeeKey()) return;
        const options = result.ok ? result.data : [];
        setBalances(options);
        // Sugiere el período más antiguo con saldo disponible.
        if (!form.getValues("vacationBalanceId")) {
          const suggested = options.find((b) => b.available > 0) ?? options.at(-1);
          if (suggested) form.setValue("vacationBalanceId", suggested.id, { shouldDirty: true });
        }
      } else {
        setBalances(null);
      }
      const current = form.getValues();
      if (!target || !current.leaveTypeId || !current.startDate || !current.endDate) {
        setPreview(null);
        return;
      }
      const key = previewKey();
      const result = await previewLeaveAction({
        employeeId: target,
        leaveTypeId: current.leaveTypeId,
        startDate: current.startDate,
        endDate: current.endDate,
        vacationBalanceId: current.vacationBalanceId || null,
        excludeId: leave?.id ?? null,
      });
      if (key === previewKey()) setPreview(result.ok ? result.data : null);
    });
  };

  const reset = () => {
    form.reset(initial);
    setFormError(undefined);
    setApprove(false);
    setBalances(null);
    setPreview(null);
  };

  const submit = form.handleSubmit((values) => {
    setFormError(undefined);
    const data = isVacation ? values : { ...values, vacationBalanceId: "" };
    startTransition(async () => {
      const result = leave
        ? await updateLeaveAction(leave.id, { ...data, version: leave.version })
        : await createLeaveAction(employeeId, { ...data, approve: canApprove && approve });
      if (!result.ok) {
        setFormError(applyActionErrors<Values>(result.error, form.setError));
        return;
      }
      toast.success(leave ? "Registro actualizado" : approve ? "Registro aprobado" : "Solicitud registrada");
      for (const warning of result.data.warnings) toast.warning(warning);
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
        {leave ? (
          <Button variant="ghost" size="icon" aria-label={`Editar ${leave.title}`}>
            <Pencil />
          </Button>
        ) : (
          <Button>
            <Plus /> {defaultClass === "VACACIONES" ? "Nuevas vacaciones" : "Nuevo registro"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{leave ? "Editar registro" : "Nuevo registro"}</DialogTitle>
          <DialogDescription>
            {leave
              ? leave.title
              : "Licencia, ausencia, vacaciones o suspensión. Los días se calculan con el tipo elegido."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {formError && <Alert variant="destructive">{formError}</Alert>}
          {pickEmployee && (
            <FormField id="leave-employee" label="Empleado" error={errors.employeeId?.message} required>
              <Select {...fieldA11y("leave-employee", errors.employeeId?.message)} {...watched("employeeId")}>
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
            id="leave-type"
            label="Tipo"
            error={errors.leaveTypeId?.message}
            hint={
              type?.requiresCertificate ? "Requiere certificado: adjuntalo desde la lista una vez guardado." : undefined
            }
            required
          >
            <Select
              {...fieldA11y("leave-type", errors.leaveTypeId?.message)}
              {...form.register("leaveTypeId", {
                onChange: () => {
                  form.setValue("vacationBalanceId", "");
                  refresh();
                },
              })}
            >
              <option value="">Elegí un tipo…</option>
              {LEAVE_CLASSES.map((leaveClass) => {
                const options = visibleTypes.filter((t) => t.class === leaveClass);
                if (options.length === 0) return null;
                return (
                  <optgroup key={leaveClass} label={LEAVE_CLASS_LABELS[leaveClass]}>
                    {options.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                        {t.isActive ? "" : " (inactivo)"}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </Select>
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="leave-start" label="Desde" error={errors.startDate?.message} required>
              <Input {...fieldA11y("leave-start", errors.startDate?.message)} type="date" {...watched("startDate")} />
            </FormField>
            <FormField id="leave-end" label="Hasta" error={errors.endDate?.message} required>
              <Input {...fieldA11y("leave-end", errors.endDate?.message)} type="date" {...watched("endDate")} />
            </FormField>
          </div>
          {isVacation && (
            <FormField
              id="leave-balance"
              label="Período de vacaciones"
              error={errors.vacationBalanceId?.message}
              hint={
                balances && balances.length === 0
                  ? "El empleado no tiene períodos generados. Generalos desde Vacaciones → Saldos."
                  : "Los días se descuentan del saldo de este período."
              }
              required
            >
              <Select
                {...fieldA11y("leave-balance", errors.vacationBalanceId?.message)}
                {...watched("vacationBalanceId")}
                value={balanceId}
              >
                <option value="">Elegí el período…</option>
                {(balances ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </Select>
            </FormField>
          )}
          {preview && (
            <div className="bg-muted/50 rounded-md border p-3 text-sm" aria-live="polite">
              <p className="font-medium">
                {preview.days} {preview.days === 1 ? "día" : "días"} ({preview.countingMode})
              </p>
              {[...preview.problems, ...preview.warnings].map((message) => (
                <p key={message} className="text-muted-foreground mt-1 text-xs">
                  {message}
                </p>
              ))}
            </div>
          )}
          <FormField id="leave-notes" label="Observaciones" error={errors.notes?.message}>
            <Textarea {...fieldA11y("leave-notes", errors.notes?.message)} rows={3} {...form.register("notes")} />
          </FormField>
          {!leave && canApprove && (
            <div className="flex items-center gap-2">
              <Checkbox id="leave-approve" checked={approve} onChange={(e) => setApprove(e.target.checked)} />
              <Label htmlFor="leave-approve">Registrar como aprobada</Label>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || (!!leave && !isDirty)}>
              {pending
                ? "Guardando…"
                : leave
                  ? "Guardar cambios"
                  : approve
                    ? "Registrar aprobada"
                    : "Registrar solicitud"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

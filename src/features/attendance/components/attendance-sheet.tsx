"use client";

import { CalendarClock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useUnsavedChanges } from "@/components/forms/use-unsaved-changes";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { saveAttendanceSheetAction } from "../actions";
import { formatMinutes, scheduleFill } from "../calc";
import type { SheetRow } from "../service";
import { AttendanceStatusBadge } from "./attendance-badges";

type RowValues = { checkIn: string; checkOut: string; breakMinutes: string; notes: string; absent: boolean };

const valuesOf = (row: SheetRow): RowValues => ({
  checkIn: row.record?.checkIn ?? "",
  checkOut: row.record?.checkOut ?? "",
  breakMinutes: row.record?.checkIn ? String(row.record.breakMinutes) : "",
  notes: row.record?.notes ?? "",
  absent: row.record?.status === "AUSENTE",
});

const same = (a: RowValues, b: RowValues) =>
  a.checkIn === b.checkIn &&
  a.checkOut === b.checkOut &&
  a.breakMinutes === b.breakMinutes &&
  a.notes.trim() === b.notes.trim() &&
  a.absent === b.absent;

/** Las horas siguen siendo las del horario que puso "Completar con el horario". */
const asScheduled = (row: SheetRow, v: RowValues) =>
  !!row.scheduled &&
  !v.absent &&
  v.checkIn === row.scheduled.checkIn &&
  v.checkOut === row.scheduled.checkOut &&
  v.breakMinutes === String(row.scheduled.breakMinutes);

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many.replace("{n}", String(n)));

function fillNotice({ fill, notFinished, withoutSchedule }: ReturnType<typeof scheduleFill>) {
  const parts = [
    fill.length > 0
      ? `${plural(fill.length, "Se completó 1 fila", "Se completaron {n} filas")} con el horario. Corregí lo distinto (ausencias, llegadas tarde, horas adicionales) y guardá la planilla.`
      : "No quedan filas para completar con el horario.",
  ];
  if (notFinished > 0) {
    parts.push(
      plural(notFinished, "1 turno todavía no terminó", "{n} turnos todavía no terminaron") +
        `: ${plural(notFinished, "completalo", "completalos")} más tarde.`,
    );
  }
  if (withoutSchedule > 0) {
    parts.push(
      plural(withoutSchedule, "1 empleado no tiene", "{n} empleados no tienen") +
        " horario asignado: cargá sus horas a mano.",
    );
  }
  return parts.join(" ");
}

const FIELD_LABELS: Record<string, string> = {
  checkIn: "Entrada",
  checkOut: "Salida",
  breakMinutes: "Descanso",
  notes: "Observaciones",
};

/**
 * Columnas de la grilla desde 1280 px; más angosto, cada fila se apila. Entrada
 * y salida dejan lugar para el formato de 12 horas ("a. m."), que es el que
 * muestra Chrome en español.
 */
const COLUMNS =
  "xl:grid xl:grid-cols-[minmax(9rem,1.4fr)_minmax(6.5rem,0.8fr)_7.5rem_7.5rem_4.5rem_4rem_minmax(7rem,1fr)_minmax(7rem,0.8fr)] xl:items-center xl:gap-2.5";

/**
 * Planilla de asistencia de un día: una fila por empleado con lo que se
 * esperaba (horario, franco, feriado o licencia) y la fichada. Se guardan
 * juntas solo las filas modificadas. "Completar con el horario" llena las
 * filas vacías con el turno de cada uno; no guarda nada hasta "Guardar".
 */
export function AttendanceSheet({ date, rows, canEdit }: { date: string; rows: SheetRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [values, setValues] = useState(() => new Map(rows.map((r) => [r.employee.id, valuesOf(r)])));
  const [errors, setErrors] = useState<Map<string, string[]>>(new Map());
  const [formError, setFormError] = useState<string>();
  const [filled, setFilled] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string>();
  const [pending, startTransition] = useTransition();

  /** Filas que el horario puede completar (aunque ya tengan algo escrito o el turno no haya terminado). */
  const fillable = rows.filter((r) => r.scheduled && !r.leave && !r.record).length;

  const changed = rows.filter((r) => !same(values.get(r.employee.id)!, valuesOf(r)));
  useUnsavedChanges(changed.length > 0);

  const update = (id: string, patch: Partial<RowValues>) => {
    setValues((current) => new Map(current).set(id, { ...current.get(id)!, ...patch }));
    setFormError(undefined);
    setErrors((current) => {
      if (!current.has(id)) return current;
      const next = new Map(current);
      next.delete(id);
      return next;
    });
  };

  const fillFromSchedule = () => {
    const result = scheduleFill(
      rows.map((row) => {
        const v = values.get(row.employee.id)!;
        return {
          id: row.employee.id,
          scheduled: row.scheduled,
          open: row.workday && !row.leave && !row.record,
          touched: v.absent || v.checkIn !== "" || v.checkOut !== "" || v.breakMinutes !== "" || v.notes.trim() !== "",
        };
      }),
      new Date(),
    );
    const byId = new Map(rows.map((r) => [r.employee.id, r]));
    setValues((current) => {
      const next = new Map(current);
      for (const id of result.fill) {
        const scheduled = byId.get(id)!.scheduled!;
        next.set(id, {
          ...current.get(id)!,
          checkIn: scheduled.checkIn,
          checkOut: scheduled.checkOut,
          breakMinutes: String(scheduled.breakMinutes),
        });
      }
      return next;
    });
    setFilled((current) => new Set([...current, ...result.fill]));
    setFormError(undefined);
    setNotice(fillNotice(result));
  };

  /** Un día hábil sin fichada tiene que marcarse ausente para que quede registrado así. */
  const rowProblem = (row: SheetRow, v: RowValues): string | null => {
    const hasTimes = v.checkIn !== "" || v.checkOut !== "";
    if (row.workday && !row.leave && !v.absent && !hasTimes) {
      return "Indicá la entrada y la salida, o marcá ausente.";
    }
    return null;
  };

  const save = () => {
    setFormError(undefined);
    const local = new Map<string, string[]>();
    for (const row of changed) {
      const problem = rowProblem(row, values.get(row.employee.id)!);
      if (problem) local.set(row.employee.id, [problem]);
    }
    if (local.size > 0) {
      setErrors(local);
      setFormError("Hay filas con problemas: corregilas y volvé a guardar.");
      return;
    }
    const payload = changed.map((row) => {
      const v = values.get(row.employee.id)!;
      return {
        employeeId: row.employee.id,
        version: row.record?.version ?? null,
        checkIn: v.absent ? "" : v.checkIn,
        checkOut: v.absent ? "" : v.checkOut,
        breakMinutes: v.absent ? "" : v.breakMinutes,
        notes: v.notes,
        fromSchedule: filled.has(row.employee.id) && asScheduled(row, v),
      };
    });
    startTransition(async () => {
      const result = await saveAttendanceSheetAction({ date, rows: payload });
      if (!result.ok) {
        const byRow = new Map<string, string[]>();
        for (const [field, messages] of Object.entries(result.error.fieldErrors ?? {})) {
          const match = /^rows\.(\d+)\.(\w+)$/.exec(field);
          const row = match ? changed[Number(match[1])] : undefined;
          if (!row) continue;
          const label = FIELD_LABELS[match![2]!];
          byRow.set(row.employee.id, [
            ...(byRow.get(row.employee.id) ?? []),
            ...messages.map((m) => (label ? `${label}: ${m}` : m)),
          ]);
        }
        setErrors(byRow);
        setFormError(result.error.message);
        return;
      }
      toast.success(
        result.data.saved === 1
          ? "Se guardó 1 fila de la planilla"
          : `Se guardaron ${result.data.saved} filas de la planilla`,
      );
      router.refresh();
    });
  };

  return (
    <div>
      {canEdit && fillable > 0 && (
        <div className="flex flex-col gap-2 border-b px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground text-sm" aria-live="polite">
            {notice ?? "Completá con el horario a quienes cumplieron su turno y corregí solo lo distinto."}
          </p>
          <Button variant="outline" size="sm" className="shrink-0" onClick={fillFromSchedule} disabled={pending}>
            <CalendarClock />
            Completar con el horario
          </Button>
        </div>
      )}
      <div className={cn("text-muted-foreground hidden border-b px-3 py-2 text-xs font-medium", COLUMNS)} aria-hidden>
        <span>Empleado</span>
        <span>Horario del día</span>
        <span>Entrada</span>
        <span>Salida</span>
        <span>Descanso (min)</span>
        <span>Ausente</span>
        <span>Observaciones</span>
        <span>Cargado</span>
      </div>
      <ul>
        {rows.map((row) => {
          const id = row.employee.id;
          const v = values.get(id)!;
          const rowErrors = errors.get(id);
          const dirty = !same(v, valuesOf(row));
          const locked = !canEdit || !!row.leave;
          const name = row.employee.name;
          return (
            <li
              key={id}
              className={cn("border-b px-3 py-3 last:border-b-0", COLUMNS, dirty && "bg-primary/5")}
              aria-label={name}
            >
              <div className="mb-2 xl:mb-0">
                <span className="font-medium">{name}</span>
                <span className="text-muted-foreground block text-xs">
                  Legajo {row.employee.fileNumber} · {row.employee.department}
                </span>
              </div>
              <div className="text-muted-foreground mb-2 text-sm xl:mb-0">
                {row.leave ? <span className="text-foreground">Con licencia: {row.leave}</span> : row.plan}
              </div>
              {row.leave ? (
                <p className="text-muted-foreground text-xs xl:col-span-5">
                  El día está cubierto por la licencia: no se carga fichada.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:contents">
                    <label className="flex flex-col gap-1 text-xs xl:contents">
                      <span className="text-muted-foreground xl:sr-only">Entrada</span>
                      <Input
                        type="time"
                        aria-label={`Entrada de ${name}`}
                        aria-invalid={rowErrors ? true : undefined}
                        value={v.checkIn}
                        disabled={locked || v.absent}
                        onChange={(e) => update(id, { checkIn: e.target.value })}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs xl:contents">
                      <span className="text-muted-foreground xl:sr-only">Salida</span>
                      <Input
                        type="time"
                        aria-label={`Salida de ${name}`}
                        aria-invalid={rowErrors ? true : undefined}
                        value={v.checkOut}
                        disabled={locked || v.absent}
                        onChange={(e) => update(id, { checkOut: e.target.value })}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs xl:contents">
                      <span className="text-muted-foreground xl:sr-only">Descanso (min)</span>
                      <Input
                        inputMode="numeric"
                        aria-label={`Descanso de ${name} en minutos`}
                        placeholder={row.workday ? String(row.defaultBreak) : "0"}
                        value={v.breakMinutes}
                        disabled={locked || v.absent}
                        onChange={(e) => update(id, { breakMinutes: e.target.value })}
                      />
                    </label>
                    <label className="flex items-center gap-2 self-end pb-2 text-xs xl:self-auto xl:pb-0">
                      {row.workday && (
                        <>
                          <Checkbox
                            aria-label={`${name} ausente`}
                            checked={v.absent}
                            disabled={locked}
                            onChange={(e) =>
                              update(
                                id,
                                e.target.checked
                                  ? { absent: true, checkIn: "", checkOut: "", breakMinutes: "" }
                                  : { absent: false },
                              )
                            }
                          />
                          <span className="xl:sr-only">Ausente</span>
                        </>
                      )}
                    </label>
                  </div>
                  <label className="mt-2 flex flex-col gap-1 text-xs xl:contents">
                    <span className="text-muted-foreground xl:sr-only">Observaciones</span>
                    <Input
                      aria-label={`Observaciones de ${name}`}
                      value={v.notes}
                      maxLength={500}
                      disabled={locked}
                      onChange={(e) => update(id, { notes: e.target.value })}
                    />
                  </label>
                </>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-1 text-xs xl:mt-0">
                {row.record ? (
                  <>
                    <AttendanceStatusBadge status={row.record.status} />
                    {row.record.workedMinutes > 0 && (
                      <span className="text-muted-foreground tabular-nums">
                        {formatMinutes(row.record.workedMinutes)} h
                        {row.record.extraMinutes > 0 && ` (+${formatMinutes(row.record.extraMinutes)})`}
                      </span>
                    )}
                    {row.record.lateMinutes > 0 && (
                      <span className="text-warning-foreground">{row.record.lateMinutes} min tarde</span>
                    )}
                  </>
                ) : filled.has(id) && asScheduled(row, v) ? (
                  <span className="text-muted-foreground">Según el horario, sin guardar</span>
                ) : (
                  <span className="text-muted-foreground">Sin cargar</span>
                )}
              </div>
              {rowErrors && (
                <ul className="text-destructive mt-2 text-xs xl:col-span-full xl:mt-0">
                  {rowErrors.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      {canEdit && (
        <div className="bg-card sticky bottom-0 flex flex-col gap-2 border-t p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            {formError ? (
              <Alert variant="destructive">{formError}</Alert>
            ) : (
              <span className="text-muted-foreground">
                {changed.length === 0
                  ? "Sin cambios."
                  : changed.length === 1
                    ? "1 fila modificada sin guardar."
                    : `${changed.length} filas modificadas sin guardar.`}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={pending || changed.length === 0}
              onClick={() => {
                setValues(new Map(rows.map((r) => [r.employee.id, valuesOf(r)])));
                setErrors(new Map());
                setFormError(undefined);
                setFilled(new Set());
                setNotice(undefined);
              }}
            >
              Descartar
            </Button>
            <Button onClick={save} disabled={pending || changed.length === 0}>
              {pending ? "Guardando…" : "Guardar planilla"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

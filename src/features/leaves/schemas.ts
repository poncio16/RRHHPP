import { parseIsoDate } from "@/lib/format";
import { baseListQuerySchema } from "@/lib/list/query";
import { z } from "@/lib/zod";

/*
 * Los esquemas aceptan su propia salida: el formulario valida en el cliente y
 * envía al servidor los valores ya normalizados (vacíos como null).
 */

/** Tope técnico del período de un registro (evita rangos cargados por error). */
export const MAX_LEAVE_SPAN_DAYS = 731;

const isoDate = (message: string) =>
  z.preprocess(
    (v) => v ?? "",
    z
      .string()
      .min(1, message)
      .refine((v) => parseIsoDate(v) !== null, "Ingresá una fecha válida."),
  );

const optionalText = (max: number) =>
  z.preprocess(
    (v) => v ?? "",
    z
      .string()
      .trim()
      .max(max)
      .transform((v) => (v === "" ? null : v)),
  );

const requiredText = (message: string, max = 500) =>
  z.preprocess((v) => v ?? "", z.string().trim().min(1, message).max(max));

export const leaveSchema = z
  .object({
    leaveTypeId: z.preprocess((v) => v ?? "", z.uuid("Elegí el tipo.")),
    startDate: isoDate("Indicá la fecha desde."),
    endDate: isoDate("Indicá la fecha hasta."),
    /** Período de vacaciones al que se imputa (solo para tipos de clase Vacaciones). */
    vacationBalanceId: z.preprocess(
      (v) => (v === "" || v === undefined ? null : v),
      z.uuid("Elegí el período.").nullable(),
    ),
    notes: optionalText(1000),
  })
  .superRefine((data, ctx) => {
    const start = parseIsoDate(data.startDate);
    const end = parseIsoDate(data.endDate);
    if (!start || !end) return;
    if (end < start) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "La fecha hasta no puede ser anterior a la desde." });
    } else if ((end.getTime() - start.getTime()) / 86_400_000 + 1 > MAX_LEAVE_SPAN_DAYS) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "El período no puede superar dos años." });
    }
  });

export type LeaveData = z.output<typeof leaveSchema>;

/** Alta desde un listado general: además elige el empleado. */
export const leaveEmployeeSchema = z.object({
  employeeId: z.preprocess((v) => v ?? "", z.uuid("Elegí el empleado.")),
});

/** En el alta, quien puede aprobar puede registrarla directamente como aprobada. */
export const leaveCreateOptionsSchema = z.object({ approve: z.boolean().default(false) });

/** `version` es el `updatedAt` leído, para detectar cambios simultáneos. */
export const leaveVersionSchema = z.object({ version: z.iso.datetime() });

export const leaveDecisionSchema = z
  .object({
    decision: z.enum(["APROBADA", "RECHAZADA"], "Elegí aprobar o rechazar."),
    notes: optionalText(500),
  })
  .superRefine((data, ctx) => {
    if (data.decision === "RECHAZADA" && !data.notes) {
      ctx.addIssue({ code: "custom", path: ["notes"], message: "Indicá el motivo del rechazo." });
    }
  });

export const annulLeaveSchema = z.object({ reason: requiredText("Indicá el motivo de la anulación.") });

/** Cálculo previo (días y avisos) mientras se completa el formulario. */
export const leavePreviewSchema = z.object({
  employeeId: z.uuid(),
  leaveTypeId: z.uuid(),
  startDate: z.string().refine((v) => parseIsoDate(v) !== null),
  endDate: z.string().refine((v) => parseIsoDate(v) !== null),
  vacationBalanceId: z.uuid().nullable().optional(),
  /** Registro que se está editando (no cuenta como solapamiento consigo mismo). */
  excludeId: z.uuid().nullable().optional(),
});

export const LEAVE_STATUS_FILTERS = ["vigentes", "pendientes", "aprobadas", "rechazadas", "anuladas", "todas"] as const;
export const LEAVE_CLASS_FILTERS = ["licencias", "ausencias", "vacaciones", "suspensiones"] as const;
export const LEAVE_TIMING_FILTERS = ["en-curso", "proximas", "finalizadas"] as const;

const optionalIsoParam = z
  .string()
  .refine((v) => parseIsoDate(v) !== null)
  .optional()
  .catch(undefined);

export const leaveListQuerySchema = baseListQuerySchema.extend({
  /** "vigentes" = solicitadas y aprobadas. */
  status: z.enum(LEAVE_STATUS_FILTERS).catch("vigentes").default("vigentes"),
  class: z.enum(LEAVE_CLASS_FILTERS).optional().catch(undefined),
  leaveTypeId: z.uuid().optional().catch(undefined),
  timing: z.enum(LEAVE_TIMING_FILTERS).optional().catch(undefined),
  /** Registros que tocan el período desde–hasta. */
  desde: optionalIsoParam,
  hasta: optionalIsoParam,
  sort: z.enum(["recientes", "inicio", "empleado"]).catch("recientes").default("recientes"),
});
export type LeaveListQuery = z.output<typeof leaveListQuerySchema>;

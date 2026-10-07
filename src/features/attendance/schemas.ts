import { parseIsoDate } from "@/lib/format";
import { baseListQuerySchema } from "@/lib/list/query";
import { z } from "@/lib/zod";
import { parseTime } from "@/features/schedules/calc";

/*
 * Los esquemas aceptan su propia salida: el formulario valida en el cliente y
 * envía al servidor los valores ya normalizados (vacíos como null).
 */

/** Tope de descanso de un día (12 horas). */
export const MAX_BREAK_MINUTES = 720;

const isoDate = (message: string) =>
  z.preprocess(
    (v) => v ?? "",
    z
      .string()
      .min(1, message)
      .refine((v) => parseIsoDate(v) !== null, "Ingresá una fecha válida."),
  );

const time = z.preprocess(
  (v) => v ?? "",
  z
    .string()
    .trim()
    .refine((v) => v === "" || parseTime(v) !== null, "Ingresá la hora como HH:MM.")
    .transform((v) => (v === "" ? null : v)),
);

const breakMinutes = z.preprocess(
  (v) => (v === "" || v === undefined ? null : typeof v === "string" ? Number(v) : v),
  z
    .number("Ingresá los minutos de descanso.")
    .int("Ingresá minutos enteros.")
    .min(0, "No puede ser negativo.")
    .max(MAX_BREAK_MINUTES, "No puede superar 720 minutos.")
    .nullable(),
);

const notes = z.preprocess(
  (v) => v ?? "",
  z
    .string()
    .trim()
    .max(500)
    .transform((v) => (v === "" ? null : v)),
);

/** Minutos de entrada a salida (la salida a la misma hora o antes es del día siguiente). */
function span(checkIn: string, checkOut: string): number {
  const start = parseTime(checkIn)!;
  const end = parseTime(checkOut)!;
  return end > start ? end - start : end + 24 * 60 - start;
}

const dayFields = {
  checkIn: time,
  checkOut: time,
  /** Vacío: se usa el descanso del horario de ese día. */
  breakMinutes,
  notes,
};

type DayFields = { checkIn: string | null; checkOut: string | null; breakMinutes: number | null };

/** Entrada y salida van juntas; el descanso tiene que ser menor que el tiempo entre ambas. */
function refineDay(data: DayFields, ctx: z.RefinementCtx, prefix: (string | number)[] = []) {
  if (data.checkIn && !data.checkOut) {
    ctx.addIssue({ code: "custom", path: [...prefix, "checkOut"], message: "Indicá la hora de salida." });
  } else if (!data.checkIn && data.checkOut) {
    ctx.addIssue({ code: "custom", path: [...prefix, "checkIn"], message: "Indicá la hora de entrada." });
  } else if (data.checkIn && data.checkOut && data.breakMinutes !== null) {
    if (data.breakMinutes >= span(data.checkIn, data.checkOut)) {
      ctx.addIssue({
        code: "custom",
        path: [...prefix, "breakMinutes"],
        message: "El descanso tiene que ser menor que el tiempo entre la entrada y la salida.",
      });
    }
  }
}

/** Un día de asistencia de un empleado (alta o edición). */
export const attendanceDaySchema = z
  .object({ date: isoDate("Indicá la fecha."), ...dayFields })
  .superRefine((data, ctx) => refineDay(data, ctx));

export type AttendanceDayData = z.output<typeof attendanceDaySchema>;

export const attendanceEmployeeSchema = z.object({
  employeeId: z.preprocess((v) => v ?? "", z.uuid("Elegí el empleado.")),
});

/** `version` es el `updatedAt` leído, para detectar cambios simultáneos. */
export const attendanceVersionSchema = z.object({ version: z.iso.datetime().nullable().default(null) });

/** Planilla de un día: solo las filas que se modificaron. */
export const attendanceSheetSchema = z
  .object({
    date: isoDate("Indicá la fecha."),
    rows: z
      .array(
        z.object({
          employeeId: z.uuid(),
          /** `updatedAt` del registro existente, o null si no había. */
          version: z.iso.datetime().nullable(),
          ...dayFields,
        }),
      )
      .min(1, "No hay cambios para guardar.")
      .max(500),
  })
  .superRefine((data, ctx) => {
    data.rows.forEach((row, index) => refineDay(row, ctx, ["rows", index]));
    const ids = new Set(data.rows.map((r) => r.employeeId));
    if (ids.size !== data.rows.length) {
      ctx.addIssue({ code: "custom", path: ["rows"], message: "Un empleado aparece más de una vez." });
    }
  });

const optionalIsoDate = z
  .string()
  .refine((v) => parseIsoDate(v) !== null)
  .optional()
  .catch(undefined);

/** Planilla diaria: fecha, sector y búsqueda (en la URL). */
export const sheetQuerySchema = z.object({
  fecha: optionalIsoDate,
  sector: z.uuid().optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
});

export const ATTENDANCE_FILTERS = [
  "todos",
  "presentes",
  "ausentes",
  "tarde",
  "adicionales",
  "licencia",
  "descanso",
] as const;

export const attendanceListQuerySchema = baseListQuerySchema.extend({
  desde: optionalIsoDate,
  hasta: optionalIsoDate,
  estado: z.enum(ATTENDANCE_FILTERS).catch("todos").default("todos"),
  sector: z.uuid().optional().catch(undefined),
  sort: z.enum(["recientes", "empleado"]).catch("recientes").default("recientes"),
});

export type AttendanceListQuery = z.output<typeof attendanceListQuerySchema>;

/** Mes del legajo ("AAAA-MM"). */
export const monthQuerySchema = z.object({
  mes: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional()
    .catch(undefined),
});

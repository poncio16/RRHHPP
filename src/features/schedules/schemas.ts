import { z } from "@/lib/zod";
import { parseTime, workedMinutes } from "./calc";

const time = z.string().refine((v) => parseTime(v) !== null, "Hora inválida (HH:MM).");

const daySchema = z
  .object({
    dayOfWeek: z.number().int().min(1).max(7),
    enabled: z.boolean(),
    startTime: z.string(),
    endTime: z.string(),
    breakMinutes: z.coerce.number().int().min(0, "No puede ser negativo.").max(600),
  })
  .superRefine((day, ctx) => {
    if (!day.enabled) return;
    for (const key of ["startTime", "endTime"] as const) {
      const result = time.safeParse(day[key]);
      if (!result.success) ctx.addIssue({ code: "custom", path: [key], message: "Hora inválida (HH:MM)." });
    }
    if (day.startTime === day.endTime && parseTime(day.startTime) !== null) {
      ctx.addIssue({ code: "custom", path: ["endTime"], message: "La salida tiene que ser distinta de la entrada." });
      return;
    }
    const minutes = workedMinutes(day.startTime, day.endTime, day.breakMinutes);
    if (minutes !== null && minutes <= 0) {
      ctx.addIssue({ code: "custom", path: ["breakMinutes"], message: "El descanso no puede cubrir toda la jornada." });
    }
  });

export const scheduleSchema = z.object({
  name: z.string().trim().min(1, "Ingresá un nombre.").max(120),
  workModalityId: z.union([z.uuid(), z.literal("").transform(() => null), z.null()]).default(null),
  days: z
    .array(daySchema)
    .length(7)
    .refine((days) => days.some((d) => d.enabled), "Marcá al menos un día de trabajo."),
});

export type ScheduleInput = z.input<typeof scheduleSchema>;

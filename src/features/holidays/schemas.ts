import { parseIsoDate } from "@/lib/format";
import { z } from "@/lib/zod";

export const holidaySchema = z.object({
  date: z
    .string()
    .trim()
    .min(1, "Ingresá la fecha.")
    .refine((v) => parseIsoDate(v) !== null, "La fecha no es válida."),
  name: z.string().trim().min(1, "Ingresá el nombre del feriado.").max(200),
  isNonWorkingOptional: z.boolean().default(false),
});

export type HolidayInput = z.input<typeof holidaySchema>;

export const holidayListQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional().catch(undefined),
});

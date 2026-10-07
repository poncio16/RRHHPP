import { parsePeriod } from "@/lib/format";
import { baseListQuerySchema } from "@/lib/list/query";
import { z } from "@/lib/zod";
import {
  isoDateField,
  notesField,
  optionalMoney,
  periodField,
  quantityField,
  versionField,
} from "@/features/salaries/schemas";

/*
 * Los esquemas aceptan su propia salida: el formulario valida en el cliente y
 * envía al servidor los valores ya normalizados.
 */

const uuidField = (message: string) => z.preprocess((v) => v ?? "", z.string().min(1, message).pipe(z.uuid(message)));

/** Importe y cantidad se validan acá en su formato; si el tipo los exige lo controla el servicio. */
export const noveltySchema = z.object({
  noveltyTypeId: uuidField("Elegí el tipo de novedad."),
  date: isoDateField("Indicá la fecha."),
  period: periodField,
  quantity: quantityField(false),
  amount: optionalMoney(),
  notes: notesField(),
  version: versionField,
});
export type NoveltyInput = z.infer<typeof noveltySchema>;

export const noveltyEmployeeSchema = z.object({ employeeId: uuidField("Elegí un empleado.") });

export const annulNoveltySchema = z.object({
  reason: z.preprocess(
    (v) => v ?? "",
    z.string().trim().min(3, "Indicá el motivo de la anulación.").max(300, "Hasta 300 caracteres."),
  ),
  version: versionField,
});

export const generationSchema = z.object({ period: periodField });

/* ----------------------------------------------------------------------------
 * Listados y operaciones en lote
 * ------------------------------------------------------------------------- */

export const NOVELTY_FILTERS = ["vigentes", "pendientes", "aprobadas", "informadas", "anuladas", "todas"] as const;
export type NoveltyFilter = (typeof NOVELTY_FILTERS)[number];

const filters = {
  estado: z.enum(NOVELTY_FILTERS).catch("vigentes").default("vigentes"),
  tipo: z.uuid().optional().catch(undefined),
  origen: z.enum(["manuales", "generadas"]).optional().catch(undefined),
  sector: z.uuid().optional().catch(undefined),
};

export const noveltyListQuerySchema = baseListQuerySchema.extend({
  periodo: z
    .string()
    .refine((v) => parsePeriod(v) !== null)
    .optional()
    .catch(undefined),
  ...filters,
});
export type NoveltyListQuery = z.infer<typeof noveltyListQuerySchema>;

/** Aprobar o marcar como informadas todas las novedades del filtro (siempre de un período). */
export const bulkNoveltySchema = z.object({
  action: z.enum(["aprobar", "informar"]),
  periodo: periodField,
  q: z.string().trim().max(100).optional(),
  ...filters,
});
export type BulkNoveltyInput = z.infer<typeof bulkNoveltySchema>;

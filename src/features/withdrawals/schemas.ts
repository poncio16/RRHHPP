import { isoDateField, notesField } from "@/features/salaries/schemas";
import { parseIsoDate } from "@/lib/format";
import { baseListQuerySchema } from "@/lib/list/query";
import { normalizeDecimal } from "@/lib/validators";
import { z } from "@/lib/zod";

/*
 * Los esquemas aceptan su propia salida: el formulario valida en el cliente y
 * envía al servidor los valores ya normalizados (importes como "1234.50").
 */

/** Importe opcional mayor o igual a 0; vacío es 0. */
const amountOrZero = () =>
  z.preprocess(
    (v) => (typeof v === "number" ? String(v) : (v ?? "")),
    z
      .string()
      .trim()
      .refine((v) => v === "" || normalizeDecimal(v) !== null, "Ingresá un importe válido, por ejemplo 1.234,56.")
      .transform((v) => (v === "" ? "0.00" : normalizeDecimal(v)!)),
  );

export const entrySchema = z
  .object({
    accountId: z.preprocess((v) => v ?? "", z.string().min(1, "Elegí la cuenta.").pipe(z.uuid("Elegí la cuenta."))),
    date: isoDateField("Indicá la fecha."),
    concept: notesField(200),
    credit: amountOrZero(),
    debit: amountOrZero(),
  })
  .superRefine((data, ctx) => {
    if (Number(data.credit) === 0 && Number(data.debit) === 0) {
      ctx.addIssue({ code: "custom", path: ["debit"], message: "Ingresá el importe del ingreso o del retiro." });
    }
  });
export type EntryInput = z.infer<typeof entrySchema>;

export const voidSchema = z.object({
  reason: z.preprocess((v) => v ?? "", z.string().trim().min(3, "Indicá el motivo de la anulación.").max(200)),
});

const optionalDate = z
  .string()
  .refine((v) => parseIsoDate(v) !== null)
  .optional()
  .catch(undefined);

export const accountListQuerySchema = baseListQuerySchema.extend({
  saldo: z.enum(["todos", "positivo", "negativo"]).catch("todos").default("todos"),
  legajo: z.enum(["con", "sin"]).optional().catch(undefined),
});
export type AccountListQuery = z.infer<typeof accountListQuerySchema>;

export const statementQuerySchema = z.object({
  desde: optionalDate,
  hasta: optionalDate,
  anulados: z.enum(["si"]).optional().catch(undefined),
  /** Sin página: la última (los movimientos más recientes). */
  page: z.coerce.number().int().min(1).optional().catch(undefined),
});
export type StatementQuery = z.infer<typeof statementQuerySchema>;

/** Destino de una hoja: una cuenta nueva con su nombre, una cuenta existente o no importarla. */
export const SHEET_NEW = "nueva";
export const SHEET_SKIP = "no-importar";

export const sheetsSchema = z.object({
  sheets: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(100),
        target: z.union([z.literal(SHEET_NEW), z.literal(SHEET_SKIP), z.uuid()]),
      }),
    )
    .min(1, "No hay hojas para asignar.")
    .max(500),
});

export const linkEmployeeSchema = z.object({
  employeeId: z.preprocess((v) => (v === "" ? null : v), z.uuid().nullable()),
});

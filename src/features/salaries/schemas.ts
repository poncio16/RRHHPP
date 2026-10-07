import { parseIsoDate, parsePeriod } from "@/lib/format";
import { baseListQuerySchema } from "@/lib/list/query";
import { normalizeDecimal } from "@/lib/validators";
import { z } from "@/lib/zod";
import { MAX_PAYROLL_LINES } from "./constants";

/*
 * Los esquemas aceptan su propia salida: el formulario valida en el cliente y
 * envía al servidor los valores ya normalizados (importes como "1234.50").
 */

const AMOUNT_EXAMPLE = "Ingresá un importe válido, por ejemplo 1.234,56.";

/** Importe con hasta dos decimales y doce dígitos enteros (Decimal(14,2)), mayor o igual a 0. */
function decimalAmount(required: boolean) {
  return z.preprocess(
    (v) => (typeof v === "number" ? String(v) : (v ?? "")),
    z
      .string()
      .trim()
      .superRefine((v, ctx) => {
        if (v === "") {
          if (required) ctx.addIssue({ code: "custom", message: "Ingresá el importe." });
        } else if (normalizeDecimal(v) === null) {
          ctx.addIssue({ code: "custom", message: AMOUNT_EXAMPLE });
        }
      })
      .transform((v) => (v === "" ? null : normalizeDecimal(v))),
  );
}

export const requiredMoney = () => decimalAmount(true).transform((v) => v as string);
export const optionalMoney = () => decimalAmount(false);

/** Cantidad mayor que 0 con hasta dos decimales (Decimal(10,2)). */
export function quantityField(required: boolean) {
  return z.preprocess(
    (v) => (typeof v === "number" ? String(v) : (v ?? "")),
    z
      .string()
      .trim()
      .superRefine((v, ctx) => {
        if (v === "") {
          if (required) ctx.addIssue({ code: "custom", message: "Ingresá la cantidad." });
          return;
        }
        const value = normalizeDecimal(v, 8);
        if (value === null) ctx.addIssue({ code: "custom", message: "Ingresá un número con hasta dos decimales." });
        else if (Number(value) <= 0) ctx.addIssue({ code: "custom", message: "Tiene que ser mayor que 0." });
      })
      .transform((v) => (v === "" ? null : normalizeDecimal(v, 8))),
  );
}

export const notesField = (max = 500) =>
  z.preprocess(
    (v) => v ?? "",
    z
      .string()
      .trim()
      .max(max)
      .transform((v) => (v === "" ? null : v)),
  );

export const isoDateField = (message: string) =>
  z.preprocess(
    (v) => v ?? "",
    z
      .string()
      .min(1, message)
      .refine((v) => parseIsoDate(v) !== null, "Ingresá una fecha válida."),
  );

/** Período "AAAA-MM". */
export const periodField = z.preprocess(
  (v) => v ?? "",
  z
    .string()
    .min(1, "Indicá el período.")
    .refine((v) => parsePeriod(v) !== null, "Indicá el mes como AAAA-MM."),
);

/** Fecha de modificación leída (bloqueo optimista); null en el alta. */
export const versionField = z.preprocess((v) => (v === "" ? null : v), z.iso.datetime().nullable().default(null));

/* ----------------------------------------------------------------------------
 * Historial salarial
 * ------------------------------------------------------------------------- */

export const salaryChangeSchema = z.object({
  effectiveDate: isoDateField("Indicá desde cuándo rige."),
  basicSalary: requiredMoney(),
  notes: notesField(),
});
export type SalaryChangeInput = z.infer<typeof salaryChangeSchema>;

export const salaryChangeUpdateSchema = salaryChangeSchema.extend({ version: versionField });

/* ----------------------------------------------------------------------------
 * Resúmenes informados
 * ------------------------------------------------------------------------- */

export const payrollLineSchema = z.object({
  conceptTypeId: z.preprocess(
    (v) => v ?? "",
    z.string().min(1, "Elegí el concepto.").pipe(z.uuid("Elegí el concepto.")),
  ),
  description: notesField(120),
  quantity: quantityField(false),
  amount: requiredMoney(),
});

export const payrollRecordSchema = z.object({
  period: periodField,
  grossReported: requiredMoney(),
  deductionsReported: requiredMoney(),
  netReported: requiredMoney(),
  notes: notesField(),
  lines: z
    .array(payrollLineSchema)
    .max(MAX_PAYROLL_LINES, `Se pueden cargar hasta ${MAX_PAYROLL_LINES} renglones.`)
    .default([]),
  version: versionField,
});
export type PayrollRecordInput = z.infer<typeof payrollRecordSchema>;

export const payrollEmployeeSchema = z.object({
  employeeId: z.preprocess((v) => v ?? "", z.string().min(1, "Elegí un empleado.").pipe(z.uuid("Elegí un empleado."))),
});

/* ----------------------------------------------------------------------------
 * Listados
 * ------------------------------------------------------------------------- */

const optionalPeriod = z
  .string()
  .refine((v) => parsePeriod(v) !== null)
  .optional()
  .catch(undefined);

export const payrollListQuerySchema = baseListQuerySchema.extend({
  periodo: optionalPeriod,
  sector: z.uuid().optional().catch(undefined),
  revisar: z.enum(["si"]).optional().catch(undefined),
});
export type PayrollListQuery = z.infer<typeof payrollListQuerySchema>;

export const SALARY_LIST_FILTERS = ["activos", "todos", "sin-basico"] as const;

export const salaryListQuerySchema = baseListQuerySchema.extend({
  estado: z.enum(SALARY_LIST_FILTERS).catch("activos").default("activos"),
  sector: z.uuid().optional().catch(undefined),
});
export type SalaryListQuery = z.infer<typeof salaryListQuerySchema>;

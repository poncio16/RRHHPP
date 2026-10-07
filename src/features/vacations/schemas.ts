import { baseListQuerySchema } from "@/lib/list/query";
import { z } from "@/lib/zod";
import { rulesProblem } from "./entitlement";

/*
 * Los esquemas aceptan su propia salida: el formulario valida en el cliente y
 * envía al servidor los valores ya normalizados.
 */

const int = (message: string, min: number, max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    z.coerce.number(message).int(message).min(min, `Debe ser al menos ${min}.`).max(max, `No puede superar ${max}.`),
  );

const optionalInt = (message: string, min: number, max: number) =>
  z.preprocess(
    (v) => (v === "" || v === undefined || (typeof v === "string" && v.trim() === "") ? null : v),
    z.coerce
      .number(message)
      .int(message)
      .min(min, `Debe ser al menos ${min}.`)
      .max(max, `No puede superar ${max}.`)
      .nullable(),
  );

export const vacationRuleSchema = z.object({
  minSeniorityYears: int("Ingresá una cantidad entera de años.", 0, 99),
  maxSeniorityYears: optionalInt("Ingresá una cantidad entera de años.", 1, 100),
  days: int("Ingresá una cantidad entera de días.", 0, 365),
});

export const vacationRulesSchema = z
  .object({ rules: z.array(vacationRuleSchema).max(20, "Cargá hasta 20 reglas.") })
  .superRefine(({ rules }, ctx) => {
    const problem = rulesProblem(rules);
    if (!problem) return;
    ctx.addIssue({
      code: "custom",
      path: problem.index < 0 ? ["rules"] : ["rules", problem.index, "minSeniorityYears"],
      message: problem.message,
    });
  });

export type VacationRulesData = z.output<typeof vacationRulesSchema>;

export const generateBalancesSchema = z.object({
  year: z.coerce.number("Elegí el año.").int().min(2000, "Elegí un año válido.").max(2100, "Elegí un año válido."),
});

export const balanceSchema = z
  .object({
    adjustmentDays: int("Ingresá una cantidad entera de días (negativa para descontar).", -365, 365),
    adjustmentReason: z.preprocess(
      (v) => v ?? "",
      z
        .string()
        .trim()
        .max(500)
        .transform((v) => (v === "" ? null : v)),
    ),
    carriedOverDays: int("Ingresá una cantidad entera de días.", 0, 365),
    notes: z.preprocess(
      (v) => v ?? "",
      z
        .string()
        .trim()
        .max(1000)
        .transform((v) => (v === "" ? null : v)),
    ),
  })
  .superRefine((data, ctx) => {
    if (data.adjustmentDays !== 0 && !data.adjustmentReason) {
      ctx.addIssue({ code: "custom", path: ["adjustmentReason"], message: "Indicá el motivo del ajuste." });
    }
  });

export const balanceVersionSchema = z.object({ version: z.iso.datetime() });

export const balanceListQuerySchema = baseListQuerySchema.extend({
  year: z.coerce.number().int().min(2000).max(2100).optional().catch(undefined),
  /** "con-saldo" = con días pendientes de usar. */
  saldo: z.enum(["con-saldo", "sin-saldo"]).optional().catch(undefined),
});
export type BalanceListQuery = z.output<typeof balanceListQuerySchema>;

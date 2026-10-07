import { parseIsoDate } from "@/lib/format";
import { baseListQuerySchema } from "@/lib/list/query";
import { z } from "@/lib/zod";
import { isoDateField, notesField, versionField } from "@/features/salaries/schemas";

/*
 * Los esquemas aceptan su propia salida: el formulario valida en el cliente y
 * envía al servidor los valores ya normalizados.
 */

const uuidField = (message: string) => z.preprocess((v) => v ?? "", z.string().min(1, message).pipe(z.uuid(message)));

const optionalIsoDate = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z
    .string()
    .refine((v) => parseIsoDate(v) !== null, "Ingresá una fecha válida.")
    .nullable(),
);

/** Alta o modificación de un egreso. `confirm` confirma en el mismo paso (solo al registrar). */
export const exitSchema = z.object({
  exitDate: isoDateField("Indicá la fecha de egreso."),
  exitTypeId: uuidField("Elegí el tipo de egreso."),
  exitReasonId: uuidField("Elegí el motivo."),
  notes: notesField(1000),
  confirm: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean()).default(false),
  version: versionField,
});
export type ExitInput = z.infer<typeof exitSchema>;

export const exitEmployeeSchema = z.object({ employeeId: uuidField("Elegí un empleado.") });

export const confirmExitSchema = z.object({ version: versionField });

export const annulExitSchema = z.object({
  reason: z.preprocess(
    (v) => v ?? "",
    z.string().trim().min(3, "Indicá el motivo de la anulación.").max(300, "Hasta 300 caracteres."),
  ),
  version: versionField,
});

/**
 * Reingreso sobre el mismo legajo. Sin fecha de antigüedad reconocida, la
 * antigüedad se cuenta desde el nuevo ingreso.
 */
export const rehireSchema = z
  .object({
    hireDate: isoDateField("Indicá la fecha de reingreso."),
    seniorityDate: optionalIsoDate,
    contractEndDate: optionalIsoDate,
    notes: notesField(500),
    version: z.coerce.number().int().min(0),
  })
  .superRefine((v, ctx) => {
    const hire = parseIsoDate(v.hireDate);
    if (!hire) return;
    if (v.seniorityDate && parseIsoDate(v.seniorityDate)! > hire) {
      ctx.addIssue({
        code: "custom",
        path: ["seniorityDate"],
        message: "La antigüedad reconocida no puede empezar después del reingreso.",
      });
    }
    if (v.contractEndDate && parseIsoDate(v.contractEndDate)! < hire) {
      ctx.addIssue({
        code: "custom",
        path: ["contractEndDate"],
        message: "El fin de contrato no puede ser anterior al reingreso.",
      });
    }
  });
export type RehireInput = z.infer<typeof rehireSchema>;

/* ----------------------------------------------------------------------------
 * Listado
 * ------------------------------------------------------------------------- */

export const EXIT_FILTERS = ["vigentes", "en-tramite", "confirmados", "anulados", "todos"] as const;
export type ExitFilter = (typeof EXIT_FILTERS)[number];

const isoParam = z
  .string()
  .refine((v) => parseIsoDate(v) !== null)
  .optional()
  .catch(undefined);

export const exitListQuerySchema = baseListQuerySchema.extend({
  estado: z.enum(EXIT_FILTERS).catch("vigentes").default("vigentes"),
  tipo: z.uuid().optional().catch(undefined),
  motivo: z.uuid().optional().catch(undefined),
  desde: isoParam,
  hasta: isoParam,
});
export type ExitListQuery = z.infer<typeof exitListQuerySchema>;

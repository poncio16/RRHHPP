import { parseIsoDate, todayInTimeZone } from "@/lib/format";
import { baseListQuerySchema } from "@/lib/list/query";
import { z } from "@/lib/zod";
import { EDITABLE_STATUSES } from "./constants";

/*
 * Los esquemas aceptan su propia salida: el formulario valida en el cliente y
 * envía al servidor los valores ya normalizados (vacíos como null).
 */

const blankToNull = (v: unknown) => (v === "" || v === undefined ? null : v);

const optionalIsoDate = z.preprocess(
  blankToNull,
  z
    .string()
    .refine((v) => parseIsoDate(v) !== null, "Ingresá una fecha válida.")
    .nullable(),
);

export const documentSchema = z
  .object({
    documentTypeId: z.preprocess((v) => v ?? "", z.uuid("Elegí el tipo de documento.")),
    issueDate: optionalIsoDate,
    expiryDate: optionalIsoDate,
    status: z.enum(EDITABLE_STATUSES, "Elegí el estado."),
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
    const issue = data.issueDate ? parseIsoDate(data.issueDate) : null;
    const expiry = data.expiryDate ? parseIsoDate(data.expiryDate) : null;
    if (issue && issue > todayInTimeZone()) {
      ctx.addIssue({ code: "custom", path: ["issueDate"], message: "La fecha de emisión no puede ser futura." });
    }
    if (issue && expiry && expiry < issue) {
      ctx.addIssue({
        code: "custom",
        path: ["expiryDate"],
        message: "El vencimiento no puede ser anterior a la emisión.",
      });
    }
  });

export type DocumentData = z.output<typeof documentSchema>;

/** Alta desde el listado general: además elige el empleado. */
export const documentWithEmployeeSchema = z.object({
  employeeId: z.preprocess((v) => v ?? "", z.uuid("Elegí el empleado.")),
});

/** Edición: `version` es el `updatedAt` leído, para detectar cambios simultáneos. */
export const documentVersionSchema = z.object({ version: z.iso.datetime() });

export const annulDocumentSchema = z.object({
  reason: z.preprocess((v) => v ?? "", z.string().trim().min(1, "Indicá el motivo de la anulación.").max(500)),
});

export const DOCUMENT_STATUS_FILTERS = ["vigentes", "pendientes", "observados", "anulados", "todos"] as const;
export const EXPIRY_FILTERS = ["vencidos", "por-vencer", "vigentes", "sin-vencimiento"] as const;

export const documentListQuerySchema = baseListQuerySchema.extend({
  documentTypeId: z.uuid().optional().catch(undefined),
  /** "vigentes" = todo lo que no está anulado. */
  status: z.enum(DOCUMENT_STATUS_FILTERS).catch("vigentes").default("vigentes"),
  expiry: z.enum(EXPIRY_FILTERS).optional().catch(undefined),
  sort: z.enum(["vencimiento", "empleado", "carga"]).catch("vencimiento").default("vencimiento"),
});
export type DocumentListQuery = z.output<typeof documentListQuerySchema>;

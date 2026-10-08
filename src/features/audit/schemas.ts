import { parseIsoDate } from "@/lib/format";
import { baseListQuerySchema } from "@/lib/list/query";
import { z } from "@/lib/zod";
import { ACTION_LABELS, RESULT_LABELS } from "./constants";

const isoDate = z
  .string()
  .refine((v) => parseIsoDate(v) !== null)
  .optional()
  .catch(undefined);

/** Filtros del visor, leídos de la URL. Un valor inválido se ignora. */
export const auditListQuerySchema = baseListQuerySchema.extend({
  desde: isoDate,
  hasta: isoDate,
  usuario: z.uuid().optional().catch(undefined),
  modulo: z.string().trim().max(40).optional().catch(undefined),
  accion: z
    .enum(Object.keys(ACTION_LABELS) as [keyof typeof ACTION_LABELS, ...(keyof typeof ACTION_LABELS)[]])
    .optional()
    .catch(undefined),
  resultado: z
    .enum(Object.keys(RESULT_LABELS) as [keyof typeof RESULT_LABELS, ...(keyof typeof RESULT_LABELS)[]])
    .optional()
    .catch(undefined),
  /** Registro afectado: tipo (p. ej. Employee) e id. */
  entidad: z.string().trim().max(60).optional().catch(undefined),
  registro: z.string().trim().max(60).optional().catch(undefined),
});
export type AuditListQuery = z.output<typeof auditListQuerySchema>;

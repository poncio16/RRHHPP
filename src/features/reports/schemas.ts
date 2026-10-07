import { z } from "@/lib/zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .catch(undefined);
const month = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  .optional()
  .catch(undefined);
const id = z.uuid().optional().catch(undefined);

/** Filtros de estructura, comunes a varios reportes (según la asignación actual de cada persona). */
export const structureFilters = z.object({
  sector: id,
  puesto: id,
  categoria: id,
  establecimiento: id,
});

export const headcountQuerySchema = structureFilters;

export const movementsQuerySchema = structureFilters.extend({ desde: month, hasta: month });

export const absenteeismQuerySchema = structureFilters.extend({ desde: isoDate, hasta: isoDate });

export const vacationsQuerySchema = structureFilters.extend({
  anio: z.coerce.number().int().min(1990).max(2100).optional().catch(undefined),
  estado: z.enum(["activos", "todos"]).catch("activos").default("activos"),
});

export const expirationsQuerySchema = structureFilters.extend({ desde: isoDate, hasta: isoDate });

export const seniorityQuerySchema = structureFilters.extend({ fecha: isoDate });

export const salaryQuerySchema = structureFilters.extend({ periodo: month });

export type StructureFilters = z.output<typeof structureFilters>;

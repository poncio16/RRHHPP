import { z } from "@/lib/zod";

export const PAGE_SIZES = [10, 20, 50, 100] as const;

/** Parámetros comunes de los listados, leídos de la URL (searchParams). */
export const baseListQuerySchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  page: z.coerce.number().int().min(1).catch(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .refine((n) => (PAGE_SIZES as readonly number[]).includes(n))
    .catch(20)
    .default(20),
});

export type Paginated<T> = { items: T[]; total: number; page: number; pageSize: number; pageCount: number };

export function paginate<T>(items: T[], total: number, page: number, pageSize: number): Paginated<T> {
  return { items, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

/** searchParams de Next (valores string | string[]) → objeto plano con el primer valor. */
export function flattenSearchParams(params: Record<string, string | string[] | undefined>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined && first !== "") result[key] = first;
  }
  return result;
}

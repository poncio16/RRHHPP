import { baseListQuerySchema } from "@/lib/list/query";
import { z } from "@/lib/zod";
import type { CatalogDefinition, CatalogField } from "./definitions";

/** Horas con hasta dos decimales, mayor que 0 y hasta 168 (una semana). Acepta coma decimal. */
export const hoursSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(",", "."))
  .pipe(
    z
      .string()
      .regex(/^\d{1,3}(\.\d{1,2})?$/, "Ingresá un número con hasta dos decimales.")
      .refine((v) => Number(v) > 0 && Number(v) <= 168, "Debe ser mayor que 0 y no superar 168 horas."),
  );

function fieldSchema(field: CatalogField): z.ZodType {
  switch (field.type) {
    case "text": {
      let text = z
        .string()
        .trim()
        .max(field.max ?? 200)
        .transform((v) => (field.uppercase ? v.toUpperCase() : v));
      if (field.pattern) {
        const pattern = new RegExp(field.pattern);
        text = text.refine((v) => v === "" || pattern.test(v), field.patternMessage ?? "Formato inválido.") as never;
      }
      // Acepta null: el formulario envía al servidor los valores ya normalizados por este mismo esquema.
      const input = (schema: z.ZodType) => z.preprocess((v) => v ?? "", schema);
      if (field.required) return input(text.refine((v) => v.length > 0, "Este campo es obligatorio."));
      return input(text.transform((v) => (v === "" ? null : v)));
    }
    case "hours":
      return hoursSchema;
    case "boolean":
      return z.boolean().default(false);
    case "ref": {
      const empty = z.literal("").transform(() => null);
      if (field.required) return z.uuid("Elegí una opción.");
      return z.union([z.uuid(), empty, z.null()]).default(null);
    }
  }
}

/**
 * Esquema del formulario de un catálogo, armado a partir de su definición.
 * Se usa igual en el cliente (resolver) y en el servidor (validación real).
 * En la edición se omiten los campos inmutables.
 */
export function catalogItemSchema(def: CatalogDefinition, mode: "create" | "update") {
  const shape: Record<string, z.ZodType> = {};
  for (const field of def.fields) {
    if (mode === "update" && field.type === "text" && field.immutable) continue;
    shape[field.name] = fieldSchema(field);
  }
  return z.object(shape);
}

export const catalogListQuerySchema = baseListQuerySchema.extend({
  status: z.enum(["activos", "inactivos", "todos"]).catch("activos").default("activos"),
});

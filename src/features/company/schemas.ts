import { isValidCuit, normalizeCuil } from "@/lib/validators";
import { z } from "@/lib/zod";

/** Texto opcional: vacío → null. Acepta null porque el formulario envía los valores ya normalizados. */
const optionalText = (max: number) =>
  z.preprocess(
    (v) => v ?? "",
    z
      .string()
      .trim()
      .max(max)
      .transform((v) => (v === "" ? null : v)),
  );

const optionalId = z.union([z.uuid(), z.literal("").transform(() => null), z.null()]).default(null);

export const companySchema = z.object({
  legalName: z.string().trim().min(1, "Ingresá la razón social.").max(200),
  tradeName: optionalText(200),
  cuit: z
    .string()
    .trim()
    .refine(isValidCuit, "El CUIT no es válido (revisá los 11 dígitos y el dígito verificador).")
    .transform(normalizeCuil),
  addressLine: optionalText(200),
  city: optionalText(120),
  provinceId: optionalId,
  postalCode: optionalText(10),
  defaultArtProviderId: optionalId,
  defaultWorkplaceId: optionalId,
});

export type CompanyInput = z.input<typeof companySchema>;

import { describe, expect, it } from "vitest";
import { companySchema } from "@/features/company/schemas";

describe("esquema de la empresa", () => {
  it("normaliza el CUIT y los vacíos, y acepta su propia salida", () => {
    const once = companySchema.parse({
      legalName: " Empresa S.A. ",
      cuit: "30-71234567-1",
      tradeName: "",
      provinceId: "",
    });
    expect(once).toMatchObject({ legalName: "Empresa S.A.", cuit: "30712345671", tradeName: null, provinceId: null });
    expect(companySchema.parse(once)).toEqual(once);
  });

  it("rechaza un CUIT con dígito verificador incorrecto", () => {
    expect(companySchema.safeParse({ legalName: "X", cuit: "30-71234567-0" }).success).toBe(false);
  });
});

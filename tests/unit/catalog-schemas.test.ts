import { describe, expect, it } from "vitest";
import { CATALOG_KEYS, CATALOGS } from "@/features/catalogs/definitions";
import { catalogItemSchema, hoursSchema } from "@/features/catalogs/schemas";

describe("esquemas de catálogos", () => {
  it("normaliza textos: recorta, pasa a mayúsculas y convierte vacíos opcionales en null", () => {
    const schema = catalogItemSchema(CATALOGS.sectores, "create");
    expect(schema.parse({ name: "  Ventas ", code: " ven " })).toEqual({ name: "Ventas", code: "VEN" });
    expect(schema.parse({ name: "Ventas", code: "" })).toEqual({ name: "Ventas", code: null });
  });

  it("valida el código de entidad bancaria", () => {
    const schema = catalogItemSchema(CATALOGS.bancos, "create");
    expect(schema.safeParse({ name: "Banco", code: "12" }).success).toBe(false);
    expect(schema.safeParse({ name: "Banco", code: "011" }).success).toBe(true);
  });

  it("en la edición omite los campos inmutables (código de las listas)", () => {
    const schema = catalogItemSchema(CATALOGS["tipos-egreso"], "update");
    expect(schema.parse({ label: "Renuncia", code: "OTRO" })).toEqual({ label: "Renuncia" });
  });

  it("las referencias vacías se guardan como null", () => {
    const schema = catalogItemSchema(CATALOGS.puestos, "create");
    expect(schema.parse({ name: "Vendedor", departmentId: "" })).toEqual({ name: "Vendedor", departmentId: null });
  });

  it("horas semanales con coma o punto decimal", () => {
    expect(hoursSchema.parse("22,5")).toBe("22.5");
    expect(hoursSchema.safeParse("0").success).toBe(false);
    expect(hoursSchema.safeParse("169").success).toBe(false);
  });

  it("cada lista simple tiene un grupo distinto", () => {
    const groups = CATALOG_KEYS.map((k) => CATALOGS[k].lookupGroup).filter(Boolean);
    expect(new Set(groups).size).toBe(groups.length);
  });
});

describe("idempotencia de los esquemas", () => {
  it("el servidor acepta los valores ya normalizados por el cliente", () => {
    for (const key of CATALOG_KEYS) {
      const schema = catalogItemSchema(CATALOGS[key], "create");
      const raw = Object.fromEntries(
        CATALOGS[key].fields.map((f) => [
          f.name,
          f.type === "boolean"
            ? true
            : f.type === "hours"
              ? "40"
              : f.type === "ref"
                ? ""
                : f.name === "code"
                  ? key === "bancos"
                    ? "011"
                    : "ABC"
                  : f.name === "rnosCode"
                    ? "123456"
                    : "Valor",
        ]),
      );
      const once = schema.parse(raw);
      expect(schema.parse(once)).toEqual(once);
    }
  });
});

import { describe, expect, it } from "vitest";
import { estimateLines, layoutPpeForm } from "@/features/ppe/layout";
import type { PpeForm } from "@/features/ppe/service";

const text = (length: number) => "Carga y descarga de mercadería en depósito ".repeat(20).slice(0, length).trimEnd();
const fiveLines = (length: number) => {
  const head = "Guantes\nCasco\nBotines\nAntiparras\n";
  return head + text(length - head.length);
};

function form(overrides: { name?: string; legalName?: string; position?: Partial<PpeForm["position"]> } = {}): PpeForm {
  return {
    employeeId: "e",
    company: { legalName: overrides.legalName ?? "Distribuidora Demo S.A.", cuit: "30-71234567-1" },
    place: { addressLine: "Calle Ficticia 567", city: "Avellaneda", postalCode: "1870", province: "Buenos Aires" },
    worker: { name: overrides.name ?? "Peralta, Hernán", dni: "29055433" },
    position: {
      name: "Operario de depósito",
      description: "Carga y descarga.",
      requiredPpe: "Guantes y botines.",
      ...overrides.position,
    },
    missing: [],
  };
}

describe("medidas del formulario de EPP", () => {
  it("cuenta renglones por palabras y por saltos de línea", () => {
    expect(estimateLines("Guantes", 50, 9)).toBe(1);
    expect(estimateLines("Guantes\nCasco", 50, 9)).toBe(2);
    expect(estimateLines("", 50, 9)).toBe(1);
    // 50 mm a 9 pt entran unas 30 letras: 120 son cuatro o cinco renglones.
    expect(estimateLines(text(120), 50, 9)).toBeGreaterThanOrEqual(4);
    expect(estimateLines(text(120), 50, 9)).toBeLessThanOrEqual(5);
    // Una palabra más larga que el ancho se corta.
    expect(estimateLines("x".repeat(200), 50, 9)).toBeGreaterThan(1);
    expect(estimateLines("Ab", 50, 9, 2)).toBe(1);
  });

  it("con datos comunes usa la letra normal en todo", () => {
    const layout = layoutPpeForm(form());
    expect(layout.fits).toBe(true);
    expect(layout.box).toBe(9);
    expect(new Set(Object.values(layout.fields))).toEqual(new Set([9]));
  });

  it("con la descripción y los elementos al máximo entra, achicando la letra si hace falta", () => {
    expect(layoutPpeForm(form({ position: { description: fiveLines(300), requiredPpe: fiveLines(300) } })).fits).toBe(
      true,
    );
    const caps = layoutPpeForm(
      form({ position: { description: fiveLines(300).toUpperCase(), requiredPpe: fiveLines(300).toUpperCase() } }),
    );
    expect(caps.fits).toBe(true);
    expect(caps.box).toBeLessThan(9);
  });

  it("un dato largo del encabezado achica su letra y deja menos lugar a los casilleros", () => {
    const layout = layoutPpeForm(form({ legalName: text(200).toUpperCase() }));
    expect(layout.fields[1]).toBeLessThan(9);
    expect(layout.fields[2]).toBe(9);
    expect(layout.boxMaxMm).toBeLessThan(layoutPpeForm(form()).boxMaxMm);
  });

  it("si ni con la letra más chica entra, avisa que se corta", () => {
    const layout = layoutPpeForm(
      form({
        legalName: text(200).toUpperCase(),
        name: `${text(100)}, ${text(100)}`.toUpperCase(),
        position: {
          name: text(120).toUpperCase(),
          description: fiveLines(300).toUpperCase(),
          requiredPpe: fiveLines(300).toUpperCase(),
        },
      }),
    );
    expect(layout.fits).toBe(false);
    expect(layout.box).toBe(7);
  });
});

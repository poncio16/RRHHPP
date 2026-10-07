import { describe, expect, it } from "vitest";
import { planGeneration, minutesToHours, type GeneratedNovelty } from "@/features/novelties/generation";
import { annulNoveltySchema, noveltySchema } from "@/features/novelties/schemas";
import { payrollWarnings, salaryVariation } from "@/features/salaries/calc";
import { payrollRecordSchema, salaryChangeSchema } from "@/features/salaries/schemas";
import { addMonths, formatPeriod, parsePeriod, periodEnd, periodKey, periodOf } from "@/lib/format";
import { decimalInput, normalizeDecimal, sumAmounts } from "@/lib/validators";

describe("importes", () => {
  it("acepta coma decimal, puntos de miles o punto decimal", () => {
    expect(normalizeDecimal("1.234,56")).toBe("1234.56");
    expect(normalizeDecimal("1234,5")).toBe("1234.50");
    expect(normalizeDecimal("1234.56")).toBe("1234.56");
    expect(normalizeDecimal("1.234")).toBe("1234.00");
    expect(normalizeDecimal("$ 1.234.567")).toBe("1234567.00");
    expect(normalizeDecimal("007")).toBe("7.00");
  });

  it("rechaza formatos ambiguos o inválidos", () => {
    expect(normalizeDecimal("1,234,56")).toBeNull();
    expect(normalizeDecimal("12.34.5")).toBeNull();
    expect(normalizeDecimal("-5")).toBeNull();
    expect(normalizeDecimal("abc")).toBeNull();
    expect(normalizeDecimal("1234567890123")).toBeNull();
  });

  it("suma exacta en centavos y valor para el formulario", () => {
    expect(sumAmounts(["0.10", "0.20", null])).toBe("0.30");
    expect(sumAmounts(["1000000.55", "2.45"])).toBe("1000003.00");
    expect(decimalInput("1234.5")).toBe("1234,50");
  });
});

describe("períodos", () => {
  it("convierte, formatea y recorre meses", () => {
    const march = parsePeriod("2025-03")!;
    expect(march.toISOString()).toBe("2025-03-01T00:00:00.000Z");
    expect(formatPeriod(march)).toBe("marzo de 2025");
    expect(periodKey(addMonths(march, -3))).toBe("2024-12");
    expect(periodEnd(parsePeriod("2024-02")!).toISOString().slice(0, 10)).toBe("2024-02-29");
    expect(periodKey(periodOf(new Date("2025-03-31T00:00:00Z")))).toBe("2025-03");
    expect(parsePeriod("2025-13")).toBeNull();
  });
});

describe("información salarial", () => {
  it("el básico es obligatorio y se normaliza", () => {
    const parsed = salaryChangeSchema.parse({ effectiveDate: "2025-03-01", basicSalary: "1.250.000,5", notes: "" });
    expect(parsed).toEqual({ effectiveDate: "2025-03-01", basicSalary: "1250000.50", notes: null });
    expect(salaryChangeSchema.parse(parsed)).toEqual(parsed);
    expect(salaryChangeSchema.safeParse({ ...parsed, basicSalary: "" }).error?.issues[0]?.message).toBe(
      "Ingresá el importe.",
    );
  });

  it("los renglones del resumen se validan uno por uno", () => {
    const base = { period: "2025-03", grossReported: "100", deductionsReported: "20", netReported: "80", notes: "" };
    const bad = payrollRecordSchema.safeParse({
      ...base,
      lines: [{ conceptTypeId: "", description: "", quantity: "0", amount: "x" }],
    });
    const paths = bad.error?.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["lines.0.conceptTypeId", "lines.0.quantity", "lines.0.amount"]));
  });

  it("avisa diferencias entre totales y renglones sin bloquear", () => {
    const lines = [
      { nature: "HABER" as const, amount: "1000.00" },
      { nature: "DESCUENTO" as const, amount: "200.00" },
      { nature: "INFORMATIVO" as const, amount: "5.00" },
    ];
    expect(payrollWarnings({ gross: "1000", deductions: "200", net: "800", lines })).toEqual([]);
    const warnings = payrollWarnings({ gross: "1100", deductions: "200", net: "850", lines });
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toMatch(/neto informado/);
    expect(warnings[1]).toMatch(/haberes de los renglones/);
    expect(payrollWarnings({ gross: "1000", deductions: "0", net: "1000", lines: [] })).toEqual([]);
  });

  it("variación entre básicos", () => {
    expect(salaryVariation("1000", "1080")).toBe("+8,0 %");
    expect(salaryVariation("1000", "950")).toBe("-5,0 %");
    expect(salaryVariation(null, "950")).toBeNull();
  });
});

describe("novedades", () => {
  it("importe y cantidad opcionales en el esquema; el motivo de anulación es obligatorio", () => {
    const parsed = noveltySchema.parse({
      noveltyTypeId: "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b",
      date: "2025-03-10",
      period: "2025-03",
      quantity: "",
      amount: "15.000",
      notes: "",
    });
    expect(parsed).toMatchObject({ quantity: null, amount: "15000.00", version: null });
    expect(noveltySchema.parse(parsed)).toEqual(parsed);
    expect(annulNoveltySchema.safeParse({ reason: " " }).success).toBe(false);
  });

  it("minutos a horas con dos decimales", () => {
    expect(minutesToHours(90)).toBe("1.50");
    expect(minutesToHours(20)).toBe("0.33");
  });

  describe("plan de generación", () => {
    const base = {
      sourceType: "ATTENDANCE_EXTRA",
      employeeId: "e1",
      noveltyTypeId: "t1",
      date: new Date("2025-03-10T00:00:00Z"),
      quantity: "1.50",
      amount: null,
      notes: "x",
    };
    const existing = (sourceId: string, status: GeneratedNovelty["status"], extra: Partial<GeneratedNovelty> = {}) => ({
      ...base,
      sourceId,
      id: `n-${sourceId}`,
      status,
      ...extra,
    });

    it("crea, actualiza, anula y respeta informadas y anuladas", () => {
      const plan = planGeneration(
        [
          { ...base, sourceId: "nueva" },
          { ...base, sourceId: "igual" },
          { ...base, sourceId: "cambia", quantity: "2" },
          { ...base, sourceId: "informada", quantity: "3" },
          { ...base, sourceId: "anulada-a-mano" },
        ],
        [
          existing("igual", "APROBADA", { quantity: "1.5" }),
          existing("cambia", "APROBADA"),
          existing("informada", "INFORMADA"),
          existing("anulada-a-mano", "ANULADA"),
          existing("sin-origen", "PENDIENTE"),
          existing("sin-origen-informada", "INFORMADA"),
        ],
      );
      expect(plan.create.map((n) => n.sourceId)).toEqual(["nueva"]);
      expect(plan.update.map((u) => u.current.sourceId)).toEqual(["cambia"]);
      expect(plan.annul.map((n) => n.sourceId)).toEqual(["sin-origen"]);
      expect(plan.informedChanged.map((c) => [c.current.sourceId, c.next === null])).toEqual([
        ["informada", false],
        ["sin-origen-informada", true],
      ]);
      expect(plan.unchanged).toBe(1);
      expect(plan.skippedAnnulled).toBe(1);
    });

    it("volver a generar sin cambios no hace nada", () => {
      const desired = [{ ...base, sourceId: "a" }];
      const plan = planGeneration(desired, [existing("a", "PENDIENTE")]);
      expect(plan).toMatchObject({ create: [], update: [], annul: [], informedChanged: [], unchanged: 1 });
    });
  });
});

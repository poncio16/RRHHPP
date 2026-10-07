import { describe, expect, it } from "vitest";
import { countDays, defaultWorkDays, isoWeekday, leaveTiming, rangesOverlap } from "@/features/leaves/days";
import { leaveDecisionSchema, leaveSchema } from "@/features/leaves/schemas";
import {
  cutoffDate,
  matchRule,
  ruleRangeLabel,
  rulesProblem,
  vacationEntitlement,
  type EntitlementParams,
} from "@/features/vacations/entitlement";
import { balanceSchema, vacationRulesSchema } from "@/features/vacations/schemas";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const MON_FRI = defaultWorkDays(5);

describe("conteo de días", () => {
  it("día de la semana ISO", () => {
    expect(isoWeekday(d("2026-10-05"))).toBe(1); // lunes
    expect(isoWeekday(d("2026-10-11"))).toBe(7); // domingo
  });

  it("días corridos incluye ambos extremos", () => {
    expect(countDays(d("2026-10-01"), d("2026-10-01"), "CORRIDOS", MON_FRI, new Set())).toBe(1);
    expect(countDays(d("2026-12-28"), d("2027-01-10"), "CORRIDOS", MON_FRI, new Set())).toBe(14);
    expect(countDays(d("2026-10-02"), d("2026-10-01"), "CORRIDOS", MON_FRI, new Set())).toBe(0);
  });

  it("días hábiles saltea los días que no trabaja y los feriados", () => {
    // Lunes 5 a domingo 18 de octubre de 2026 con feriado el lunes 12.
    const holidays = new Set(["2026-10-12"]);
    expect(countDays(d("2026-10-05"), d("2026-10-18"), "HABILES", MON_FRI, holidays)).toBe(9);
    expect(countDays(d("2026-10-05"), d("2026-10-18"), "HABILES", defaultWorkDays(6), holidays)).toBe(11);
    expect(countDays(d("2026-10-10"), d("2026-10-11"), "HABILES", MON_FRI, new Set())).toBe(0);
  });

  it("solapamiento y estado por fechas", () => {
    expect(rangesOverlap(d("2026-01-01"), d("2026-01-10"), d("2026-01-10"), d("2026-01-12"))).toBe(true);
    expect(rangesOverlap(d("2026-01-01"), d("2026-01-09"), d("2026-01-10"), d("2026-01-12"))).toBe(false);
    expect(leaveTiming(d("2026-01-10"), d("2026-01-12"), d("2026-01-09"))).toBe("PROXIMA");
    expect(leaveTiming(d("2026-01-10"), d("2026-01-12"), d("2026-01-12"))).toBe("EN_CURSO");
    expect(leaveTiming(d("2026-01-10"), d("2026-01-12"), d("2026-01-13"))).toBe("FINALIZADA");
  });
});

const RULES = [
  { minSeniorityYears: 0, maxSeniorityYears: 5, days: 14 },
  { minSeniorityYears: 5, maxSeniorityYears: 10, days: 21 },
  { minSeniorityYears: 10, maxSeniorityYears: 20, days: 28 },
  { minSeniorityYears: 20, maxSeniorityYears: null, days: 35 },
];

describe("reglas de vacaciones", () => {
  it("cada regla va de más de su inicio hasta su tope inclusive", () => {
    expect(matchRule({ years: 0, months: 0, days: 0 }, RULES)?.days).toBe(14);
    expect(matchRule({ years: 5, months: 0, days: 0 }, RULES)?.days).toBe(14);
    expect(matchRule({ years: 5, months: 0, days: 1 }, RULES)?.days).toBe(21);
    expect(matchRule({ years: 20, months: 0, days: 0 }, RULES)?.days).toBe(28);
    expect(matchRule({ years: 35, months: 2, days: 0 }, RULES)?.days).toBe(35);
    expect(matchRule({ years: 3, months: 0, days: 0 }, [])).toBeNull();
  });

  it("textos de los rangos", () => {
    expect(RULES.map(ruleRangeLabel)).toEqual([
      "Hasta 5 años",
      "Más de 5 y hasta 10 años",
      "Más de 10 y hasta 20 años",
      "Más de 20 años",
    ]);
  });

  it("las reglas cubren todas las antigüedades sin huecos ni superposiciones", () => {
    expect(rulesProblem(RULES)).toBeNull();
    expect(rulesProblem([])?.message).toMatch(/al menos una/);
    expect(rulesProblem([{ ...RULES[1]!, maxSeniorityYears: null }])?.message).toMatch(/empezar en 0/);
    expect(rulesProblem([RULES[0]!, RULES[2]!, RULES[3]!])).toMatchObject({ index: 1 });
    expect(rulesProblem([RULES[0]!, RULES[1]!])?.message).toMatch(/sin tope/);
    expect(rulesProblem([{ ...RULES[0]!, maxSeniorityYears: null }, RULES[3]!])?.message).toMatch(/Solo la última/);
  });

  it("el esquema del formulario acepta su propia salida y marca la regla con problemas", () => {
    const raw = {
      rules: [
        { minSeniorityYears: "0", maxSeniorityYears: "5", days: "14" },
        { minSeniorityYears: "5", maxSeniorityYears: "", days: "21" },
      ],
    };
    const once = vacationRulesSchema.parse(raw);
    expect(vacationRulesSchema.parse(once)).toEqual(once);
    const bad = vacationRulesSchema.safeParse({
      rules: [{ minSeniorityYears: "1", maxSeniorityYears: "", days: "1" }],
    });
    expect(bad.error?.issues[0]?.path).toEqual(["rules", 0, "minSeniorityYears"]);
  });
});

describe("días de vacaciones de un período", () => {
  const base: EntitlementParams = {
    year: 2026,
    cutoff: { month: 12, day: 31 },
    seniorityDate: d("2020-03-01"),
    hireDate: d("2020-03-01"),
    rules: RULES,
    proportionalMinPercent: 50,
    proportionalWorkedDays: 20,
    workDays: MON_FRI,
    holidays: new Set(),
  };

  it("fecha de corte con meses cortos", () => {
    expect(cutoffDate(2026, 12, 31)).toEqual(d("2026-12-31"));
    expect(cutoffDate(2026, 2, 31)).toEqual(d("2026-02-28"));
    expect(cutoffDate(2028, 2, 29)).toEqual(d("2028-02-29"));
  });

  it("período completo según la antigüedad al corte", () => {
    const result = vacationEntitlement(base)!;
    expect(result.seniority).toEqual({ years: 6, months: 9, days: 30 });
    expect(result).toMatchObject({ days: 21, proportional: false });
    expect(result.workedDays).toBe(result.periodWorkDays);
  });

  it("la antigüedad reconocida puede ser anterior al ingreso actual", () => {
    const result = vacationEntitlement({ ...base, seniorityDate: d("2010-01-01"), hireDate: d("2024-01-01") })!;
    expect(result).toMatchObject({ days: 28, proportional: false });
  });

  it("con menos del mínimo trabajado corresponde la proporción", () => {
    // Ingreso el 1/10/2026: 66 días hábiles de lunes a viernes hasta el 31/12.
    const result = vacationEntitlement({ ...base, seniorityDate: d("2026-10-01"), hireDate: d("2026-10-01") })!;
    expect(result.workedDays).toBe(66);
    expect(result).toMatchObject({ proportional: true, days: 3 });
    // Con la proporción desactivada se aplica la regla.
    expect(vacationEntitlement({ ...base, hireDate: d("2026-10-01"), proportionalMinPercent: 0 })?.days).toBe(21);
  });

  it("sin derecho si al corte todavía no había ingresado", () => {
    expect(vacationEntitlement({ ...base, hireDate: d("2027-01-04"), seniorityDate: d("2027-01-04") })).toBeNull();
  });
});

describe("esquemas", () => {
  it("licencia: fechas obligatorias, hasta no anterior a desde y tope de dos años", () => {
    const ok = leaveSchema.parse({
      leaveTypeId: "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b",
      startDate: "2026-10-01",
      endDate: "2026-10-03",
      vacationBalanceId: "",
      notes: " ",
    });
    expect(ok).toMatchObject({ vacationBalanceId: null, notes: null });
    expect(leaveSchema.parse(ok)).toEqual(ok);
    const inverted = leaveSchema.safeParse({ ...ok, endDate: "2026-09-30" });
    expect(inverted.error?.issues[0]?.path).toEqual(["endDate"]);
    const long = leaveSchema.safeParse({ ...ok, endDate: "2029-01-01" });
    expect(long.error?.issues[0]?.message).toMatch(/dos años/);
  });

  it("el rechazo necesita motivo; la aprobación no", () => {
    expect(leaveDecisionSchema.safeParse({ decision: "RECHAZADA", notes: "" }).success).toBe(false);
    expect(leaveDecisionSchema.safeParse({ decision: "APROBADA" }).success).toBe(true);
  });

  it("el ajuste de un período necesita motivo", () => {
    const base = { adjustmentDays: "0", adjustmentReason: "", carriedOverDays: "2", notes: "" };
    expect(balanceSchema.parse(base)).toMatchObject({ adjustmentDays: 0, carriedOverDays: 2 });
    const bad = balanceSchema.safeParse({ ...base, adjustmentDays: "-3" });
    expect(bad.error?.issues[0]?.path).toEqual(["adjustmentReason"]);
    const once = balanceSchema.parse({ ...base, adjustmentDays: "-3", adjustmentReason: "Días adelantados" });
    expect(balanceSchema.parse(once)).toEqual(once);
  });
});

import { describe, expect, it } from "vitest";
import {
  formatAmount,
  formatDate,
  formatDateTime,
  formatMoney,
  parseAmount,
  parseDate,
  parseIsoDate,
  todayInTimeZone,
  toIsoDate,
} from "@/lib/format";

describe("fechas", () => {
  it("formatea fechas de calendario como DD/MM/AAAA sin correrse de día", () => {
    expect(formatDate(new Date(Date.UTC(2026, 0, 5)))).toBe("05/01/2026");
    expect(formatDate(null)).toBe("");
  });

  it("parsea DD/MM/AAAA y rechaza fechas inexistentes", () => {
    expect(parseDate("29/02/2024")?.toISOString()).toBe("2024-02-29T00:00:00.000Z");
    expect(parseDate("29/02/2026")).toBeNull();
    expect(parseDate("31/04/2026")).toBeNull();
    expect(parseDate("2026-01-05")).toBeNull();
  });

  it("convierte entre ISO y Date", () => {
    const date = parseIsoDate("2026-10-06")!;
    expect(toIsoDate(date)).toBe("2026-10-06");
    expect(parseIsoDate("2026-13-01")).toBeNull();
  });

  it("muestra instantes en la hora de Buenos Aires", () => {
    // 02:30 UTC del 7/10 son las 23:30 del 6/10 en Argentina (UTC-3)
    expect(formatDateTime(new Date("2026-10-07T02:30:00Z"))).toBe("06/10/2026 23:30");
  });

  it("calcula el día de hoy según la zona horaria", () => {
    const now = new Date("2026-10-07T02:30:00Z");
    expect(toIsoDate(todayInTimeZone(undefined, now))).toBe("2026-10-06");
  });
});

describe("importes", () => {
  it("formatea pesos argentinos", () => {
    expect(formatMoney(1234567.89)).toBe("$ 1.234.567,89");
    expect(formatMoney("0")).toBe("$ 0,00");
    expect(formatAmount(1500)).toBe("1.500,00");
  });

  it("parsea importes con formato argentino", () => {
    expect(parseAmount("$ 1.234.567,89")).toBe("1234567.89");
    expect(parseAmount("1500")).toBe("1500");
    expect(parseAmount("12,345")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
  });
});

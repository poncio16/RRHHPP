import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { defaultWorkDays } from "@/features/leaves/days";
import { absenceBreakdown, employedOn, employmentPeriods, rangeOf, seniorityRanges } from "@/features/reports/calc";
import type { ReportTable } from "@/features/reports/table";
import { reportToXlsx, tableToCsv } from "@/server/export";
import { SETTING_DEFINITIONS } from "@/server/settings/definitions";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("períodos de empleo", () => {
  it("arma un período por ingreso y cierra cada uno con su egreso", () => {
    const periods = employmentPeriods({
      hireDate: d("2025-03-01"),
      previousHires: [d("2020-01-10")],
      exits: [d("2024-06-30")],
    });
    expect(periods).toEqual([
      { start: d("2020-01-10"), end: d("2024-06-30"), rehire: false },
      { start: d("2025-03-01"), end: null, rehire: true },
    ]);
    expect(employedOn(periods, d("2024-06-30"))).toBe(true);
    expect(employedOn(periods, d("2024-07-01"))).toBe(false);
    expect(employedOn(periods, d("2025-03-01"))).toBe(true);
  });

  it("sin reingresos, el egreso confirmado cierra el único período", () => {
    const periods = employmentPeriods({ hireDate: d("2022-01-01"), previousHires: [], exits: [d("2026-10-07")] });
    expect(periods).toEqual([{ start: d("2022-01-01"), end: d("2026-10-07"), rehire: false }]);
  });
});

describe("rangos de antigüedad", () => {
  it("arma los rangos desde los límites e ignora los ceros", () => {
    const ranges = seniorityRanges([1, 5, 10, 0, 0]);
    expect(ranges.map((r) => r.label)).toEqual([
      "Menos de 1 año",
      "De 1 a menos de 5 años",
      "De 5 a menos de 10 años",
      "10 años o más",
    ]);
    expect(rangeOf(ranges, 0).label).toBe("Menos de 1 año");
    expect(rangeOf(ranges, 5).label).toBe("De 5 a menos de 10 años");
    expect(rangeOf(ranges, 37).label).toBe("10 años o más");
  });

  it("valida que los límites crezcan y no tengan huecos", () => {
    const schema = SETTING_DEFINITIONS.seniority.schema;
    expect(schema.safeParse({ limit1: 1, limit2: 5, limit3: 10, limit4: 20, limit5: 0 }).success).toBe(true);
    const decreasing = schema.safeParse({ limit1: 5, limit2: 3, limit3: 0, limit4: 0, limit5: 0 });
    expect(decreasing.error?.issues[0]?.path).toEqual(["limit2"]);
    const gap = schema.safeParse({ limit1: 1, limit2: 0, limit3: 10, limit4: 0, limit5: 0 });
    expect(gap.error?.issues[0]?.message).toMatch(/límite anterior/);
  });
});

describe("ausentismo por tipo", () => {
  it("atribuye a la licencia el día que también tiene ausencia", () => {
    const result = absenceBreakdown({
      start: d("2026-10-01"),
      end: d("2026-10-09"),
      holidays: new Set(),
      attendanceType: "Asistencia",
      absentDays: [
        { employeeId: "a", date: d("2026-10-01") },
        { employeeId: "a", date: d("2026-10-02") },
      ],
      leaves: [{ employeeId: "a", startDate: d("2026-10-02"), endDate: d("2026-10-05"), type: "Enfermedad" }],
      employees: [{ id: "a", hireDate: d("2020-01-01"), exitDate: null, workDays: defaultWorkDays(5) }],
    });
    const a = result.get("a")!;
    expect(a.expected).toBe(7);
    // Jueves 1 por asistencia; viernes 2 y lunes 5 por la licencia (sábado y domingo no cuentan).
    expect(a.lost).toBe(3);
    expect(Object.fromEntries(a.byType)).toEqual({ Asistencia: 1, Enfermedad: 2 });
  });
});

const table: ReportTable = {
  id: "t",
  title: "Tabla: prueba",
  columns: [
    { key: "nombre", label: "Nombre" },
    { key: "fecha", label: "Fecha", type: "date" },
    { key: "importe", label: "Importe", type: "money" },
    { key: "tasa", label: "Ausentismo", type: "percent" },
  ],
  rows: [
    { nombre: "Pérez; Ana", fecha: d("2026-10-07"), importe: 1234.5, tasa: 0.0523 },
    { nombre: '=HYPERLINK("x")', fecha: null, importe: null, tasa: null },
  ],
  totals: { nombre: "Total", fecha: null, importe: 1234.5, tasa: null },
  empty: "Sin filas",
};

describe("exportación", () => {
  it("CSV para Excel en español, sin fórmulas", () => {
    const csv = tableToCsv(table);
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe("Nombre;Fecha;Importe;Ausentismo (%)");
    expect(lines[1]).toBe('"Pérez; Ana";07/10/2026;1234,50;5,2');
    expect(lines[2]).toBe(`"'=HYPERLINK(""x"")";;;`);
    expect(lines[3]).toBe("Total;;1234,50;");
  });

  it("Excel con fechas y números reales", async () => {
    const buffer = await reportToXlsx({ title: "Reporte", filters: ["Filtro"], tables: [table] }, [table]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const sheet = workbook.worksheets[0]!;
    expect(sheet.name).toBe("Tabla  prueba");
    const header = sheet.getRow(4);
    expect(header.getCell(1).value).toBe("Nombre");
    const row = sheet.getRow(5);
    expect((row.getCell(2).value as Date).toISOString().slice(0, 10)).toBe("2026-10-07");
    expect(row.getCell(3).value).toBe(1234.5);
    expect(sheet.getRow(6).getCell(1).value).toBe(`'=HYPERLINK("x")`);
  });
});

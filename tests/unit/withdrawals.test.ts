import { describe, expect, it } from "vitest";
import { entryKey, fingerprints, runningBalance } from "@/features/withdrawals/calc";
import {
  findHeader,
  inferHeader,
  mapRow,
  parseCellAmount,
  parseCellDate,
  similarAccounts,
  similarNames,
  type Cell,
  type Columns,
  type Sheet,
} from "@/features/withdrawals/map";

const TODAY = new Date(Date.UTC(2026, 9, 26));
const text = (value: string): Cell => ({ text: value });
const num = (value: number): Cell => ({ text: String(value), number: value });
const day = (iso: string): Cell => ({ text: iso, date: new Date(`${iso}T00:00:00Z`) });
const row = (rowNumber: number, ...cells: Cell[]) => ({ rowNumber, cells });

/** Columnas de las planillas de retiros: Fecha, Ingreso, Retiro, Saldo, Descripción. */
const COLUMNS: Columns = { fecha: 0, ingreso: 1, retiro: 2, concepto: 4 };

describe("encabezado de las planillas", () => {
  it("lo encuentra debajo de los títulos y deja afuera el saldo", () => {
    const sheet: Sheet = {
      name: "Ivancito",
      rows: [
        row(1, text("Retiros Empleados 2022")),
        row(3, text("Ivancito")),
        row(5, text("Fecha"), text("Ingreso"), text("Retiro"), text("Saldo"), text("Descripción INGRESO 15-05-12")),
      ],
    };
    expect(findHeader(sheet)).toEqual({ index: 2, columns: COLUMNS, ignored: [] });
  });

  it("usa las columnas de las otras hojas cuando una no tiene encabezado", () => {
    const sheet: Sheet = {
      name: "Uriel",
      rows: [row(1, text("Retiros")), row(2, day("2012-02-02"), text(""), num(-300))],
    };
    expect(findHeader(sheet)).toBeNull();
    expect(inferHeader(sheet, [COLUMNS, { ...COLUMNS }])).toEqual({ index: 0, columns: COLUMNS, ignored: [] });
    expect(inferHeader(sheet, [COLUMNS, { fecha: 1, importe: 2 }])).toBeNull();
  });
});

describe("valores de las celdas", () => {
  it("lee importes con signo, separadores y paréntesis", () => {
    expect(parseCellAmount(num(-8333.16))).toBe(-833316n);
    expect(parseCellAmount(num(666.8400000000001))).toBe(66684n);
    expect(parseCellAmount(text("1.234,56"))).toBe(123456n);
    expect(parseCellAmount(text("(500)"))).toBe(-50000n);
    expect(parseCellAmount(text(""))).toBeNull();
    expect(parseCellAmount(text("abc"))).toBe("invalid");
  });

  it("lee fechas de Excel, de texto y números de serie", () => {
    expect(parseCellDate(day("2022-03-01"))?.toISOString()).toBe("2022-03-01T00:00:00.000Z");
    expect(parseCellDate(text("5/3/2024"))?.toISOString()).toBe("2024-03-05T00:00:00.000Z");
    expect(parseCellDate(text("5/3/24"))?.toISOString()).toBe("2024-03-05T00:00:00.000Z");
    expect(parseCellDate(num(45000))?.toISOString()).toBe("2023-03-15T00:00:00.000Z");
    expect(parseCellDate(text("01-10-113"))).toBeNull();
  });
});

describe("filas de movimientos", () => {
  const map = (cells: Cell[], previous: string | null = null) =>
    mapRow("Hoja", row(10, ...cells), COLUMNS, TODAY, previous);

  it("carga los retiros con signo menos como retiros", () => {
    expect(map([day("2022-03-04"), text(""), num(-36000), num(0), text("Adelanto")])).toEqual({
      kind: "entry",
      entry: {
        sheet: "Hoja",
        rowNumber: 10,
        date: "2022-03-04",
        concept: "Adelanto",
        credit: "0.00",
        debit: "36000.00",
        opening: false,
      },
    });
  });

  it("suma las columnas como el saldo de la planilla: lo negativo es retiro y lo positivo, ingreso", () => {
    const negative = map([day("2014-12-01"), num(-385), text(""), num(3209.5), text("Extras, 7hs negativas")]);
    expect(negative.kind === "entry" && [negative.entry.credit, negative.entry.debit]).toEqual(["0.00", "385.00"]);
    const final = map([day("2015-03-16"), text(""), num(15098), num(15193), text("LIQUIDACION FINAL")]);
    expect(final.kind === "entry" && [final.entry.credit, final.entry.debit]).toEqual(["15098.00", "0.00"]);
  });

  it("una fila sin fecha toma la de la fila anterior", () => {
    const result = map([text(""), text(""), num(-13902.27), num(-77508.46), text("Visa eminent")], "2017-04-21");
    expect(result.kind === "entry" && result.entry.date).toBe("2017-04-21");
    expect(map([text(""), text(""), num(-100)]).kind).toBe("error");
  });

  it("omite las notas, los saldos y los totales", () => {
    expect(map([day("2022-02-01"), text(""), text(""), num(0), text("Ingreso - Sueldo $36000")]).kind).toBe("skip");
    expect(map([text(""), text(""), text(""), num(-10295856.96)]).kind).toBe("skip");
    expect(map([text(""), num(5000), text(""), num(0), text("Total")]).kind).toBe("skip");
  });

  it("rechaza fechas futuras, viejas o mal escritas", () => {
    expect(map([day("2069-12-12"), text(""), num(-2244)])).toMatchObject({ kind: "error" });
    expect(map([day("1900-01-10"), num(90000)])).toMatchObject({ kind: "error" });
    expect(map([text("01-0120"), num(2500)])).toMatchObject({
      kind: "error",
      error: { message: expect.stringContaining("01-0120") },
    });
  });
});

describe("repetidos", () => {
  it("numera los movimientos iguales del mismo día", () => {
    const key = entryKey("cuenta", "2020-01-02", "0", "5000");
    expect(key).toBe("cuenta|2020-01-02|0.00|5000.00");
    const keys = [key, entryKey("cuenta", "2020-01-02", "0", "15000"), key];
    expect(fingerprints(keys)).toEqual([`${key}|1`, "cuenta|2020-01-02|0.00|15000.00|1", `${key}|2`]);
  });
});

describe("saldo", () => {
  it("acumula ingresos menos retiros y salta los anulados", () => {
    const { rows, closing } = runningBalance(
      [
        { credit: "20000.00", debit: "0.00", voided: false },
        { credit: "0.00", debit: "15000.00", voided: false },
        { credit: "0.00", debit: "999.00", voided: true },
        { credit: "0.00", debit: "6000.50", voided: false },
      ],
      "100.00",
    );
    expect(rows.map((r) => r.balance)).toEqual(["20100.00", "5100.00", null, "-900.50"]);
    expect(closing).toBe("-900.50");
  });

  it("un saldo de la planilla fija el saldo y muestra el ajuste", () => {
    const { rows, closing } = runningBalance([
      { credit: "0.00", debit: "5000.00", voided: false },
      { credit: "0.00", debit: "8000.00", voided: false, isBalance: true },
      { credit: "1000.00", debit: "0.00", voided: false },
    ]);
    expect(rows.map((r) => r.balance)).toEqual(["-5000.00", "-8000.00", "-7000.00"]);
    expect(rows[1]!.adjustment).toBe("-3000.00");
    expect(closing).toBe("-7000.00");
  });
});

describe("nombres de hoja parecidos", () => {
  it("reconoce apodos de la misma persona", () => {
    expect(similarNames("Luci", "Luciano")).toBe(true);
    expect(similarNames("Fabi2", "Fabi")).toBe(true);
    expect(similarNames("Johny", "Jony")).toBe(true);
    expect(similarNames("Pablo G", "Pablo")).toBe(true);
    expect(similarNames("Ale", "Alberto")).toBe(false);
    expect(similarNames("Nico", "Naty")).toBe(false);
  });

  it("devuelve las cuentas parecidas", () => {
    const accounts = [{ name: "Luciano" }, { name: "Franco" }, { name: "Luca" }];
    // "Luca" difiere en una letra: también se ofrece, y la persona elige.
    expect(similarAccounts("Luci", accounts).map((a) => a.name)).toEqual(["Luciano", "Luca"]);
  });
});

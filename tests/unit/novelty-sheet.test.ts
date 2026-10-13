import { describe, expect, it } from "vitest";
import { measuresOf, noveltyColumns, noveltyTotals, type SheetType } from "@/features/novelties/sheet";

const base: SheetType = {
  id: "t",
  name: "Tipo",
  requiresAmount: false,
  requiresQuantity: false,
  quantityUnit: null,
  linkedLeaveTypes: 0,
};

describe("columnas de la planilla del contador", () => {
  it("cada tipo suma lo que pide; sin cantidad ni importe cuenta las novedades", () => {
    expect(measuresOf({ ...base, requiresQuantity: true })).toEqual(["quantity"]);
    expect(measuresOf({ ...base, requiresAmount: true })).toEqual(["amount"]);
    expect(measuresOf({ ...base, requiresQuantity: true, requiresAmount: true })).toEqual(["quantity", "amount"]);
    expect(measuresOf(base)).toEqual(["count"]);
    // Las licencias vinculadas informan los días aunque el tipo no pida cantidad.
    expect(measuresOf({ ...base, linkedLeaveTypes: 1 })).toEqual(["quantity"]);
  });

  it("con cantidad e importe arma dos columnas con la unidad y el signo", () => {
    expect(
      noveltyColumns([
        { ...base, id: "a", name: "Horas", requiresQuantity: true, quantityUnit: "horas" },
        { ...base, id: "b", name: "Viáticos", requiresQuantity: true, requiresAmount: true, quantityUnit: "días" },
        { ...base, id: "c", name: "Bono", requiresQuantity: true, requiresAmount: true },
        { ...base, id: "d", name: "Sanción" },
      ]),
    ).toEqual([
      { key: "quantity:a", label: "Horas", type: "decimal" },
      { key: "quantity:b", label: "Viáticos (días)", type: "decimal" },
      { key: "amount:b", label: "Viáticos ($)", type: "money" },
      { key: "quantity:c", label: "Bono (cantidad)", type: "decimal" },
      { key: "amount:c", label: "Bono ($)", type: "money" },
      { key: "count:d", label: "Sanción", type: "int" },
    ]);
  });

  it("suma por empleado en centavos y completa con 0", () => {
    const columns = noveltyColumns([
      { ...base, id: "q", requiresQuantity: true },
      { ...base, id: "m", requiresAmount: true },
      { ...base, id: "n" },
    ]);
    const totals = noveltyTotals(columns, [
      { employeeId: "e1", noveltyTypeId: "m", quantity: null, amount: "0.10" },
      { employeeId: "e1", noveltyTypeId: "m", quantity: null, amount: "0.20" },
      { employeeId: "e1", noveltyTypeId: "q", quantity: "1.25", amount: null },
      { employeeId: "e1", noveltyTypeId: "n", quantity: null, amount: null },
      { employeeId: "e1", noveltyTypeId: "otro", quantity: "9.00", amount: null },
    ]);
    expect(totals("e1")).toEqual({ "quantity:q": 1.25, "amount:m": 0.3, "count:n": 1 });
    expect(totals("e2")).toEqual({ "quantity:q": 0, "amount:m": 0, "count:n": 0 });
  });
});

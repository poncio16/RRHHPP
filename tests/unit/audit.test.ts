import { describe, expect, it } from "vitest";
import { diffRows, formatAuditValue } from "@/features/audit/diff";
import { auditListQuerySchema } from "@/features/audit/schemas";

describe("auditoría: valores", () => {
  it("muestra fechas, instantes, booleanos y listas de forma legible", () => {
    expect(formatAuditValue("2020-03-01T00:00:00.000Z")).toBe("01/03/2020");
    expect(formatAuditValue("2026-10-07")).toBe("07/10/2026");
    expect(formatAuditValue("2026-10-07T15:30:00.000Z")).toBe("07/10/2026 12:30");
    expect(formatAuditValue(true)).toBe("Sí");
    expect(formatAuditValue(null)).toBeNull();
    expect(formatAuditValue("")).toBeNull();
    expect(formatAuditValue(["a", "b"])).toBe("a, b");
    expect(formatAuditValue({ sector: "x" })).toBe('{"sector":"x"}');
    expect(formatAuditValue("1234.50")).toBe("1234.50");
  });
});

describe("auditoría: cambios", () => {
  it("una modificación marca los campos que cambiaron, con su nombre", () => {
    const rows = diffRows({ lastName: "Uno", city: "A" }, { lastName: "Dos", city: "A" });
    expect(rows).toEqual([
      { field: "lastName", label: "Apellido", before: "Uno", after: "Dos", changed: true },
      { field: "city", label: "Localidad", before: "A", after: "A", changed: false },
    ]);
  });

  it("un alta solo tiene el después y los campos desconocidos usan su nombre técnico", () => {
    const rows = diffRows(null, { hireDate: "2021-05-01T00:00:00.000Z", otroCampo: 3 });
    expect(rows).toEqual([
      { field: "hireDate", label: "Fecha de ingreso", before: null, after: "01/05/2021", changed: false },
      { field: "otroCampo", label: "otroCampo", before: null, after: "3", changed: false },
    ]);
  });

  it("traduce IDs referidos y muestra valores que no son objetos como detalle", () => {
    const id = "0190a000-0000-7000-8000-000000000002";
    expect(diffRows({ departmentId: null }, { departmentId: id }, new Map([[id, "Ventas"]]))[0]).toMatchObject({
      label: "Sector",
      before: null,
      after: "Ventas",
      changed: true,
    });
    expect(diffRows(null, ["a", "b"])).toEqual([
      { field: "", label: "Detalle", before: null, after: "a, b", changed: true },
    ]);
    expect(diffRows(null, null)).toEqual([]);
  });
});

describe("auditoría: filtros", () => {
  it("ignora valores inválidos en la URL", () => {
    const query = auditListQuerySchema.parse({
      desde: "2026-02-30",
      hasta: "2026-10-07",
      accion: "HACKEAR",
      resultado: "DENIED",
      usuario: "no-es-uuid",
      page: "2",
    });
    expect(query).toMatchObject({
      desde: undefined,
      hasta: "2026-10-07",
      accion: undefined,
      resultado: "DENIED",
      page: 2,
    });
    expect(query.usuario).toBeUndefined();
  });
});

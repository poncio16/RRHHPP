import { describe, expect, it } from "vitest";
import { auditMessage, entityLabel } from "@/features/audit/constants";
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
    expect(formatAuditValue([])).toBeNull();
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
    expect(
      diffRows({ departmentId: null }, { departmentId: id }, { labels: new Map([[id, "Ventas"]]) })[0],
    ).toMatchObject({
      label: "Sector",
      before: null,
      after: "Ventas",
      changed: true,
    });
    expect(diffRows(null, ["a", "b"])).toEqual([
      { field: "", label: "Detalle", before: null, after: "a\nb", changed: true },
    ]);
    expect(diffRows(null, null)).toEqual([]);
  });
});

describe("auditoría: nombres y valores", () => {
  const roleA = "0190a000-0000-7000-8000-00000000000a";
  const roleB = "0190a000-0000-7000-8000-00000000000b";

  it("un cambio de rol se muestra una vez, con el nombre del rol", () => {
    const rows = diffRows(
      { roleId: roleA, role: "Consulta" },
      { roleId: roleB, role: "RRHH" },
      {
        entityType: "User",
        labels: new Map([
          [roleA, "Consulta"],
          [roleB, "RRHH"],
        ]),
      },
    );
    expect(rows).toEqual([{ field: "role", label: "Rol", before: "Consulta", after: "RRHH", changed: true }]);
  });

  it("no muestra el id ni las relaciones vacías que repiten su …Id", () => {
    const rows = diffRows(
      null,
      { id: "x", lastName: "Pérez", category: null, categoryId: null, sex: "F", status: "ACTIVO" },
      {
        entityType: "Employee",
      },
    );
    expect(rows.map((r) => [r.label, r.after])).toEqual([
      ["Apellido", "Pérez"],
      ["Sexo", "Femenino"],
      ["Categoría", null],
      ["Estado", "Activo"],
    ]);
  });

  it("el origen de una novedad generada solo aparece si se puede nombrar", () => {
    const leave = "0190a000-0000-7000-8000-0000000000e1";
    const group = "0190a000-0000-7000-8000-0000000000e2";
    const labels = new Map([[leave, "Vacaciones del 01/03/2026 al 14/03/2026"]]);
    const origin = (sourceType: string, sourceId: string) =>
      diffRows(null, { sourceType, sourceId }, { entityType: "Novelty", labels }).map((r) => [r.label, r.after]);
    expect(origin("LEAVE", leave)).toEqual([
      ["Origen", "Licencias y ausencias"],
      ["Registro de origen", "Vacaciones del 01/03/2026 al 14/03/2026"],
    ]);
    expect(origin("CATEGORY_CHANGE", group)).toEqual([["Origen", "Historial laboral"]]);
  });

  it("el estado se traduce según el tipo de registro", () => {
    const status = (entityType: string, value: string) => diffRows(null, { status: value }, { entityType })[0]!.after;
    expect(status("LeaveRecord", "SOLICITADA")).toBe("Solicitada");
    expect(status("AttendanceDay", "JUSTIFICADO")).toBe("Con licencia");
    expect(status("EmployeeExit", "CONFIRMADO")).toBe("Confirmado");
    expect(status("ImportJob", "CONFIRMADO")).toBe("Confirmada");
    expect(status("Novelty", "INFORMADA")).toBe("Informada");
    expect(status("Desconocido", "RARO")).toBe("RARO");
  });

  it("parámetros y catálogos usan las etiquetas de su formulario", () => {
    expect(
      diffRows({ lockMinutes: 15 }, { lockMinutes: 30 }, { entityType: "Setting", entityId: "security" })[0],
    ).toMatchObject({
      label: "Duración del bloqueo (minutos)",
      before: "15",
      after: "30",
    });
    const leaveType = diffRows(
      null,
      { class: "LICENCIA", countingMode: "HABILES", isSensitive: true },
      { entityType: "LeaveType" },
    );
    expect(leaveType.map((r) => [r.label, r.after])).toEqual([
      ["Clase", "Licencia"],
      ["Cómo se cuentan los días", "Días hábiles"],
      ["Dato de salud (sensible)", "Sí"],
    ]);
    expect(diffRows(null, { code: "007" }, { entityType: "Bank" })[0]!.label).toBe("Código de entidad");
    const documentType = diffRows(
      { requirement: null, requiredFrom: null },
      { requirement: "MENSUAL", requiredFrom: "2026-10" },
      { entityType: "DocumentType" },
    );
    expect(documentType.map((r) => [r.label, r.before, r.after])).toEqual([
      ["Obligatorio en todo legajo", null, "Sí, todos los meses"],
      ["Controlar desde (mes)", null, "octubre de 2026"],
    ]);
    // El mes de un documento.
    expect(diffRows(null, { period: "2026-09" }, { entityType: "Document" })[0]!.after).toBe("septiembre de 2026");
  });

  it("importes, horas, CUIT, permisos y listas vacías se muestran legibles", () => {
    const rows = diffRows(
      { permissions: ["employee:read"], cuit: "30712345678" },
      { permissions: [], amount: "150000.5", weeklyHours: "37.50", cuit: "30712345678" },
    );
    expect(Object.fromEntries(rows.map((r) => [r.field, [r.before, r.after]]))).toEqual({
      permissions: ["Ver legajos (datos generales)", null],
      cuit: ["30-71234567-8", "30-71234567-8"],
      amount: [null, "$ 150.000,50"],
      weeklyHours: [null, "37,5"],
    });
  });

  it("una exportación muestra el reporte, el formato y los filtros por su nombre", () => {
    const sector = "0190a000-0000-7000-8000-0000000000c1";
    const rows = diffRows(
      null,
      { recurso: "altas-y-bajas", formato: "xlsx", filtros: { sector, desde: "2026-01", hasta: "2026-06" }, filas: 3 },
      { entityType: "Reporte", labels: new Map([[sector, "Ventas"]]) },
    );
    expect(rows.map((r) => [r.label, r.after])).toEqual([
      ["Reporte", "Altas y bajas"],
      ["Formato", "Excel"],
      ["Filtros", "Sector: Ventas\nDesde: enero de 2026\nHasta: junio de 2026"],
      ["Filas", "3"],
    ]);
  });

  it("los filtros de la URL se muestran tal cual aunque se llamen como algo de JavaScript", () => {
    const [filters] = diffRows(
      null,
      { filtros: { toString: "1", constructor: "y", __defineGetter__: "1", q: "2026-03" } },
      { entityType: "Listado" },
    );
    expect(filters!.after).toBe("toString: 1\nconstructor: y\n__defineGetter__: 1\nBúsqueda: 2026-03");
    expect(entityLabel("toString")).toBe("toString");
    expect(diffRows(null, { status: "constructor" }, { entityType: "constructor" })[0]!.after).toBe("constructor");
  });

  it("los conceptos de un resumen y las reglas de vacaciones van uno por línea", () => {
    const concept = "0190a000-0000-7000-8000-0000000000d1";
    const [lines] = diffRows(
      null,
      { lines: [{ conceptTypeId: concept, description: "Marzo", quantity: "8.00", amount: "12000.00" }] },
      { labels: new Map([[concept, "Horas extras"]]) },
    );
    expect(lines!.after).toBe("Horas extras (Marzo), cantidad 8: $ 12.000,00");
    const [rules] = diffRows(
      null,
      { rules: ["Hasta 5 años: 14", "Más de 5 años: 21"] },
      { entityType: "VacationRule" },
    );
    expect(rules).toMatchObject({
      label: "Reglas por antigüedad",
      after: "Hasta 5 años: 14 días\nMás de 5 años: 21 días",
    });
    const [days] = diffRows(
      null,
      { days: "1 09:00-18:00 (60 min), 6 22:00-06:00 (0 min)" },
      { entityType: "WorkSchedule" },
    );
    expect(days).toMatchObject({
      label: "Días y horarios",
      after: "Lunes de 09:00 a 18:00, descanso 60 min\nSábado de 22:00 a 06:00, descanso 0 min",
    });
  });

  it("nombra los registros y traduce el permiso de un acceso denegado", () => {
    expect(entityLabel("LeaveRecord")).toBe("Licencia o ausencia");
    expect(entityLabel("OtraCosa")).toBe("OtraCosa");
    expect(auditMessage("Falta el permiso audit:read")).toBe('Falta el permiso "Ver auditoría"');
    expect(auditMessage("Falta el permiso inventado:read")).toBe("Falta el permiso inventado:read");
    expect(auditMessage(null)).toBeNull();
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

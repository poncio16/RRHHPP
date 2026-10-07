import { describe, expect, it } from "vitest";
import { buildTimeline, type TimelineSources } from "@/features/employees/timeline";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const by = { name: "RRHH" };

const base: TimelineSources = {
  hireDate: d("2025-03-01"),
  history: [],
  salaries: null,
  leaves: null,
  exits: null,
  canSeeHealth: false,
};

describe("buildTimeline", () => {
  it("muestra el ingreso actual cuando no hubo reingresos", () => {
    const events = buildTimeline(base);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "ingreso", title: "Ingreso" });
    expect(events[0]?.date).toEqual(d("2025-03-01"));
  });

  it("con reingresos, el ingreso original sale del historial", () => {
    const events = buildTimeline({
      ...base,
      history: [
        {
          id: "h1",
          changeSetId: "s1",
          changeType: "REINGRESO",
          field: "hireDate",
          oldValue: "10/02/2020",
          newValue: "01/03/2025",
          effectiveDate: d("2025-03-01"),
          notes: null,
          createdAt: d("2025-03-01"),
          createdBy: by,
        },
        {
          id: "h2",
          changeSetId: "s1",
          changeType: "REINGRESO",
          field: "seniorityDate",
          oldValue: "10/02/2020",
          newValue: "01/03/2025",
          effectiveDate: d("2025-03-01"),
          notes: "Vuelve",
          createdAt: d("2025-03-01"),
          createdBy: by,
        },
      ],
      exits: [
        {
          id: "e1",
          exitDate: d("2023-06-30"),
          status: "CONFIRMADO",
          notes: null,
          exitType: { label: "Renuncia" },
          exitReason: { label: "Mudanza" },
          confirmedBy: by,
        },
      ],
    });
    expect(events.map((e) => e.title)).toEqual(["Reingreso", "Egreso: Renuncia", "Ingreso"]);
    expect(events[0]?.lines).toEqual([
      "Ingreso: 10/02/2020 → 01/03/2025",
      "Antigüedad reconocida: 10/02/2020 → 01/03/2025",
    ]);
    expect(events[2]?.date).toEqual(d("2020-02-10"));
  });

  it("agrupa los cambios de una misma operación y calcula la variación del básico", () => {
    const events = buildTimeline({
      ...base,
      history: ["PUESTO", "SECTOR"].map((changeType, i) => ({
        id: `h${i}`,
        changeSetId: "s",
        changeType,
        field: changeType.toLowerCase(),
        oldValue: "A",
        newValue: "B",
        effectiveDate: d("2025-05-01"),
        notes: null,
        createdAt: d("2025-05-01"),
        createdBy: by,
      })),
      salaries: [
        { id: "s1", effectiveDate: d("2025-03-01"), basicSalary: "1000000.00", notes: null },
        { id: "s2", effectiveDate: d("2025-06-01"), basicSalary: "1100000.00", notes: null },
      ],
    });
    const labor = events.find((e) => e.kind === "laboral");
    expect(labor?.title).toBe("Cambios laborales");
    expect(labor?.lines).toEqual(["Puesto: A → B", "Sector: A → B"]);
    const raise = events.find((e) => e.title === "Cambio de básico");
    expect(raise?.lines[0]).toMatch(/\(\+10,0 %\)$/);
    expect(events.find((e) => e.title === "Básico inicial")).toBeDefined();
  });

  it("oculta las licencias de salud sin permiso", () => {
    const leave = {
      id: "l1",
      startDate: d("2025-04-01"),
      endDate: d("2025-04-03"),
      days: 3,
      notes: "Detalle médico",
      leaveType: { name: "Enfermedad", class: "LICENCIA" as const, isSensitive: true },
    };
    const hidden = buildTimeline({ ...base, leaves: [leave] }).find((e) => e.kind === "licencia");
    expect(hidden).toMatchObject({ title: "Licencia (dato reservado)", notes: null });
    expect(hidden?.lines).toEqual(["Del 01/04/2025 al 03/04/2025 · 3 días"]);
    const shown = buildTimeline({ ...base, leaves: [leave], canSeeHealth: true }).find((e) => e.kind === "licencia");
    expect(shown).toMatchObject({ title: "Enfermedad", notes: "Detalle médico" });
  });
});

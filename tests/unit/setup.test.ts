import { describe, expect, it } from "vitest";
import { daysToNextYear, nextYearHolidaysDue, setupSteps, setupTitle, type SetupCounts } from "@/features/system/setup";
import { SETTING_DEFINITIONS } from "@/server/settings/definitions";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** Todo cargado: no falta nada. */
const done: SetupCounts = {
  company: true,
  departments: 3,
  positions: 5,
  workplaces: 1,
  schedules: 2,
  holidays: 18,
  nextYearHolidays: 17,
  admins: 2,
  employees: 40,
};
/** Recién instalado: solo los datos base del seed. */
const fresh: SetupCounts = {
  company: false,
  departments: 0,
  positions: 0,
  workplaces: 0,
  schedules: 0,
  holidays: 0,
  nextYearHolidays: 0,
  admins: 1,
  employees: 0,
};
/** Nada consultado: quien mira no puede resolver ningún paso. */
const unchecked: SetupCounts = {
  company: null,
  departments: null,
  positions: null,
  workplaces: null,
  schedules: null,
  holidays: null,
  nextYearHolidays: null,
  admins: null,
  employees: null,
};
const all = { today: d("2026-12-10"), canCreateEmployee: true, canImport: true, canCreateCatalogs: true };
const keys = (counts: SetupCounts, options = all) => setupSteps(counts, options).map((s) => s.key);

describe("puesta en marcha", () => {
  it("recién instalado: todos los pasos, en orden", () => {
    expect(keys(fresh)).toEqual([
      "empresa",
      "sectores",
      "puestos",
      "establecimientos",
      "horarios",
      "feriados-2026",
      "feriados-2027",
      "personal",
      "administrador",
    ]);
  });

  it("con todo cargado no queda ningún paso", () => {
    expect(setupSteps(done, all)).toEqual([]);
  });

  it("cada paso desaparece cuando se carga lo que pide", () => {
    const stepOf: Record<keyof SetupCounts, string> = {
      company: "empresa",
      departments: "sectores",
      positions: "puestos",
      workplaces: "establecimientos",
      schedules: "horarios",
      holidays: "feriados-2026",
      nextYearHolidays: "feriados-2027",
      employees: "personal",
      admins: "administrador",
    };
    for (const [field, step] of Object.entries(stepOf) as [keyof SetupCounts, string][]) {
      expect(keys({ ...fresh, [field]: done[field] })).toEqual(keys(fresh).filter((k) => k !== step));
    }
  });

  it("lo que no se consultó no aparece, aunque el resto falte", () => {
    expect(keys(unchecked)).toEqual([]);
    expect(keys({ ...unchecked, holidays: 0 })).toEqual(["feriados-2026"]);
    expect(keys({ ...unchecked, admins: 1 })).toEqual(["administrador"]);
  });

  it("hace falta más de un administrador activo", () => {
    expect(keys({ ...done, admins: 1 })).toEqual(["administrador"]);
    expect(keys({ ...done, admins: 0 })).toEqual(["administrador"]);
    expect(keys({ ...done, admins: 3 })).toEqual([]);
  });

  it("el personal se ofrece cargar o importar según los permisos", () => {
    const links = (options: typeof all) =>
      setupSteps({ ...done, employees: 0 }, options)
        .find((s) => s.key === "personal")
        ?.links.map((l) => l.href);
    expect(links(all)).toEqual(["/empleados/nuevo", "/importar"]);
    expect(links({ ...all, canImport: false })).toEqual(["/empleados/nuevo"]);
    expect(links({ ...all, canCreateEmployee: false })).toEqual(["/importar"]);
    expect(links({ ...all, canCreateEmployee: false, canImport: false })).toBeUndefined();
  });

  it("si la importación puede dar de alta sectores, puestos y establecimientos, no los pide antes", () => {
    const detail = (options: typeof all) =>
      setupSteps({ ...done, employees: 0 }, options).find((s) => s.key === "personal")?.detail;
    expect(detail(all)).toBe(
      "De a un legajo (antes hacen falta sectores, puestos y establecimientos) o con la planilla de importación, que da de alta los que falten.",
    );
    expect(detail({ ...all, canCreateEmployee: false })).toBe(
      "Con la planilla de importación, que da de alta los sectores, puestos y establecimientos que falten.",
    );
    const before =
      "De a un legajo o con la planilla de importación. Antes hacen falta sectores, puestos y establecimientos.";
    expect(detail({ ...all, canCreateCatalogs: false })).toBe(before);
    expect(detail({ ...all, canImport: false })).toBe(before);
  });

  it("los feriados llevan a la pantalla filtrada por su año", () => {
    const steps = setupSteps({ ...done, holidays: 0, nextYearHolidays: 0 }, all);
    expect(steps.map((s) => [s.title, s.links[0]?.href])).toEqual([
      ["Cargar los feriados de 2026", "/configuracion/feriados?year=2026"],
      ["Cargar los feriados de 2027", "/configuracion/feriados?year=2027"],
    ]);
    expect(steps.every((s) => s.recurring)).toBe(true);
    expect(steps[1]?.detail).toContain("2027 empieza en 22 días");
    const lastDay = setupSteps({ ...done, nextYearHolidays: 0 }, { ...all, today: d("2026-12-31") });
    expect(lastDay[0]?.detail).toContain("2027 empieza mañana");
  });

  it("el título dice puesta en marcha mientras falte un paso de una sola vez", () => {
    expect(setupTitle(setupSteps(fresh, all))).toBe("Puesta en marcha");
    expect(setupTitle(setupSteps({ ...done, holidays: 0 }, all))).toBe("Configuración pendiente");
    expect(setupTitle(setupSteps({ ...done, holidays: 0, schedules: 0 }, all))).toBe("Puesta en marcha");
  });
});

describe("aviso de feriados del año siguiente", () => {
  it("cuenta los días hasta el 1 de enero", () => {
    expect(daysToNextYear(d("2026-12-31"))).toBe(1);
    expect(daysToNextYear(d("2026-12-01"))).toBe(31);
    expect(daysToNextYear(d("2026-01-01"))).toBe(365);
    expect(daysToNextYear(d("2028-01-01"))).toBe(366);
  });

  it("avisa desde la anticipación configurada; 0 lo desactiva", () => {
    expect(nextYearHolidaysDue(d("2026-12-01"), 30)).toBe(false);
    expect(nextYearHolidaysDue(d("2026-12-02"), 30)).toBe(true);
    expect(nextYearHolidaysDue(d("2026-12-31"), 30)).toBe(true);
    expect(nextYearHolidaysDue(d("2026-10-13"), 120)).toBe(true);
    expect(nextYearHolidaysDue(d("2026-12-31"), 0)).toBe(false);
  });

  it("la anticipación es un parámetro, con 30 días por defecto", () => {
    const { schema } = SETTING_DEFINITIONS.alerts;
    expect(schema.parse({}).nextYearHolidaysDays).toBe(30);
    expect(schema.safeParse({ nextYearHolidaysDays: 121 }).success).toBe(false);
    expect(schema.safeParse({ nextYearHolidaysDays: -1 }).success).toBe(false);
  });
});

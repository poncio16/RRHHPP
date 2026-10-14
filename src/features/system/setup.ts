/*
 * Puesta en marcha: pasos de configuración que faltan, armados con conteos de
 * la base (funciones puras). Fechas de calendario en UTC.
 */

/**
 * Lo cargado. `null` en un conteo: quien mira no puede resolver ese paso (no
 * se consultó) y el paso no aparece.
 */
export type SetupCounts = {
  company: boolean | null;
  /** Sectores, puestos, establecimientos y horarios activos. */
  departments: number | null;
  positions: number | null;
  workplaces: number | null;
  schedules: number | null;
  /** Feriados del año en curso. */
  holidays: number | null;
  /** Feriados del año siguiente; `null` también cuando todavía no corresponde avisar. */
  nextYearHolidays: number | null;
  /** Usuarios activos con el rol Administrador. */
  admins: number | null;
  /** Legajos, de cualquier estado. */
  employees: number | null;
};

export type SetupLink = { label: string; href: string };

export type SetupStep = {
  key: string;
  title: string;
  detail: string;
  links: SetupLink[];
  /** Se repite cada año (los feriados); el resto se hace una sola vez. */
  recurring: boolean;
};

const DAY_MS = 86_400_000;

/** Días que faltan para el 1 de enero siguiente. */
export function daysToNextYear(today: Date): number {
  return Math.round((Date.UTC(today.getUTCFullYear() + 1, 0, 1) - today.getTime()) / DAY_MS);
}

/** Si ya corresponde avisar que faltan los feriados del año siguiente (0 desactiva el aviso). */
export function nextYearHolidaysDue(today: Date, daysBefore: number): boolean {
  return daysBefore > 0 && daysToNextYear(today) <= daysBefore;
}

const HOLIDAYS_DETAIL = "No vienen precargados porque cambian cada año.";

/**
 * Pasos pendientes, en el orden en que conviene hacerlos. Cada uno desaparece
 * cuando lo que pide ya está cargado.
 */
export function setupSteps(
  counts: SetupCounts,
  {
    today,
    canCreateEmployee,
    canImport,
    canCreateCatalogs,
  }: { today: Date; canCreateEmployee: boolean; canImport: boolean; canCreateCatalogs: boolean },
): SetupStep[] {
  const year = today.getUTCFullYear();
  const steps: SetupStep[] = [];
  const add = (pending: boolean, step: Omit<SetupStep, "recurring"> & { recurring?: boolean }) => {
    if (pending) steps.push({ recurring: false, ...step });
  };

  add(counts.company === false, {
    key: "empresa",
    title: "Cargar los datos de la empresa",
    detail: "Razón social, CUIT y domicilio, y la ART y el establecimiento que se sugieren en cada legajo nuevo.",
    links: [{ label: "Ir a Empresa", href: "/configuracion/empresa" }],
  });
  add(counts.departments === 0, {
    key: "sectores",
    title: "Cargar los sectores",
    detail: "Las áreas de la empresa. Cada legajo pertenece a un sector.",
    links: [{ label: "Ir a Sectores", href: "/configuracion/catalogos/sectores" }],
  });
  add(counts.positions === 0, {
    key: "puestos",
    title: "Cargar los puestos",
    detail: "Cada legajo tiene un puesto de trabajo.",
    links: [{ label: "Ir a Puestos", href: "/configuracion/catalogos/puestos" }],
  });
  add(counts.workplaces === 0, {
    key: "establecimientos",
    title: "Cargar los establecimientos",
    detail: "Sucursales, plantas u oficinas. Cada legajo indica dónde trabaja la persona.",
    links: [{ label: "Ir a Establecimientos", href: "/configuracion/catalogos/establecimientos" }],
  });
  add(counts.schedules === 0, {
    key: "horarios",
    title: "Cargar los horarios",
    detail:
      "Sin horarios, la asistencia no calcula llegadas tarde ni horas adicionales por exceder el turno, y no se puede completar con el horario.",
    links: [{ label: "Ir a Horarios", href: "/configuracion/horarios" }],
  });
  add(counts.holidays === 0, {
    key: `feriados-${year}`,
    title: `Cargar los feriados de ${year}`,
    detail: `${HOLIDAYS_DETAIL} Sin ellos, asistencia, licencias y ausentismo cuentan los feriados como días de trabajo.`,
    links: [{ label: "Ir a Feriados", href: `/configuracion/feriados?year=${year}` }],
    recurring: true,
  });
  const days = daysToNextYear(today);
  add(counts.nextYearHolidays === 0, {
    key: `feriados-${year + 1}`,
    title: `Cargar los feriados de ${year + 1}`,
    detail: `${HOLIDAYS_DETAIL} ${year + 1} empieza ${days === 1 ? "mañana" : `en ${days} días`}.`,
    links: [{ label: "Ir a Feriados", href: `/configuracion/feriados?year=${year + 1}` }],
    recurring: true,
  });
  const personnelLinks: SetupLink[] = [
    ...(canCreateEmployee ? [{ label: "Cargar un legajo", href: "/empleados/nuevo" }] : []),
    ...(canImport ? [{ label: "Importar desde Excel", href: "/importar" }] : []),
  ];
  // La importación da de alta los sectores, puestos y establecimientos que falten si quien importa administra los catálogos.
  const personnelDetail = !(canImport && canCreateCatalogs)
    ? "De a un legajo o con la planilla de importación. Antes hacen falta sectores, puestos y establecimientos."
    : canCreateEmployee
      ? "De a un legajo (antes hacen falta sectores, puestos y establecimientos) o con la planilla de importación, que da de alta los que falten."
      : "Con la planilla de importación, que da de alta los sectores, puestos y establecimientos que falten.";
  add(counts.employees === 0 && personnelLinks.length > 0, {
    key: "personal",
    title: "Cargar el personal",
    detail: personnelDetail,
    links: personnelLinks,
  });
  add(counts.admins !== null && counts.admins < 2, {
    key: "administrador",
    title: "Crear un segundo administrador",
    detail:
      "Para no depender de una sola cuenta: si quien administra olvida la contraseña o deja la empresa, otra persona puede entrar.",
    links: [{ label: "Ir a Usuarios", href: "/usuarios" }],
  });
  return steps;
}

/** "Puesta en marcha" mientras falte algún paso de una sola vez; si solo faltan feriados, "Configuración pendiente". */
export function setupTitle(steps: SetupStep[]): string {
  return steps.some((s) => !s.recurring) ? "Puesta en marcha" : "Configuración pendiente";
}

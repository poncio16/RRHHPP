import "server-only";
import { canImport } from "@/features/imports/service";
import { todayInTimeZone } from "@/lib/format";
import { hasPermission } from "@/server/authz";
import { ADMIN_ROLE } from "@/server/authz/roles";
import type { ActorContext } from "@/server/context";
import { logger } from "@/server/logger";
import { getSetting } from "@/server/settings";
import * as repo from "./repository";
import { nextYearHolidaysDue, setupSteps, setupTitle } from "./setup";

export type SystemStatus =
  | { database: "ok"; migrations: number; reference: { provinces: number; lookupValues: number } }
  | { database: "error" };

/** Estado real de la instalación: conexión, migraciones aplicadas y catálogos de referencia. */
export async function getSystemStatus(): Promise<SystemStatus> {
  try {
    await repo.pingDatabase();
    const [migrations, reference] = await Promise.all([repo.countAppliedMigrations(), repo.countReferenceData()]);
    return { database: "ok", migrations, reference };
  } catch (error) {
    logger.error({ err: error }, "No se pudo consultar el estado de la base de datos");
    return { database: "error" };
  }
}

export async function getCompanyDisplayName(): Promise<string> {
  return (await repo.findCompanyName()) ?? "Empresa sin configurar";
}

/**
 * Qué pasos puede resolver quien mira: los mismos permisos que piden las
 * pantallas a las que llevan (el alta de legajos, como /empleados/nuevo, pide
 * también ver datos personales; importar, lo mismo que /importar).
 */
export function setupAccess(ctx: ActorContext) {
  const can = (permission: Parameters<typeof hasPermission>[1]) => hasPermission(ctx, permission);
  return {
    company: can("config:manage"),
    catalogs: can("config:catalogs"),
    users: can("user:manage"),
    newEmployee: can("employee:write") && can("employee.personal:read"),
    importer: canImport(ctx),
  };
}

/**
 * Pasos de configuración que faltan, solo los que quien mira puede resolver:
 * cada uno lleva a una pantalla y aparece con el permiso de esa pantalla. Lo
 * que el rol no puede resolver ni se consulta. Los feriados del año siguiente
 * se avisan desde la anticipación de Parámetros → Alertas.
 */
export async function getSetupChecklist(ctx: ActorContext, today: Date = todayInTimeZone()) {
  const access = setupAccess(ctx);
  const year = today.getUTCFullYear();

  const remindNextYear =
    access.catalogs && nextYearHolidaysDue(today, (await getSetting("alerts")).nextYearHolidaysDays);
  const [company, catalogs, holidays, nextYearHolidays, admins, employees] = await Promise.all([
    access.company ? repo.companyExists() : null,
    access.catalogs ? repo.activeCatalogCounts() : null,
    access.catalogs ? repo.holidaysInYear(year) : null,
    remindNextYear ? repo.holidaysInYear(year + 1) : null,
    access.users ? repo.activeUsersWithRole(ADMIN_ROLE) : null,
    access.newEmployee || access.importer ? repo.employeesCount() : null,
  ]);
  const steps = setupSteps(
    {
      company,
      departments: catalogs?.departments ?? null,
      positions: catalogs?.positions ?? null,
      workplaces: catalogs?.workplaces ?? null,
      schedules: catalogs?.schedules ?? null,
      holidays,
      nextYearHolidays,
      admins,
      employees,
    },
    { today, canCreateEmployee: access.newEmployee, canImport: access.importer, canCreateCatalogs: access.catalogs },
  );
  const title = setupTitle(steps);
  // Lo que el sistema no puede saber si ya se hizo: se le recuerda a quien
  // administra los parámetros mientras dure la puesta en marcha. Los tipos de
  // licencia están en Catálogos, con su propio permiso.
  const review = access.company && title === "Puesta en marcha" ? { leaveTypes: access.catalogs } : null;
  return { title, steps, review };
}
export type SetupChecklist = Awaited<ReturnType<typeof getSetupChecklist>>;

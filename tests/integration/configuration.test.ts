import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as catalogs from "@/features/catalogs/service";
import * as company from "@/features/company/service";
import * as holidays from "@/features/holidays/service";
import * as schedules from "@/features/schedules/service";
import * as settings from "@/features/settings/service";
import type { ActorContext } from "@/server/context";
import { db } from "@/server/db";
import { ConflictError, ForbiddenError, toAppError, ValidationError } from "@/server/errors";
import { getSetting } from "@/server/settings";
import { actorFor, createTestUser, lastAudit } from "./helpers";

let admin: ActorContext;
let rrhh: ActorContext;
let consulta: ActorContext;
const suffix = Date.now().toString(36);

beforeAll(async () => {
  admin = await actorFor((await createTestUser("ADMIN")).id);
  rrhh = await actorFor((await createTestUser("RRHH")).id);
  consulta = await actorFor((await createTestUser("CONSULTA")).id);
});

afterAll(async () => {
  await db.$disconnect();
});

/** Ejecuta la operación y devuelve el error ya traducido (como lo ve el usuario). */
async function appErrorOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return toAppError(error);
  }
  throw new Error("Se esperaba un error");
}

describe("catálogos", () => {
  it("RRHH da de alta, edita y desactiva un sector, y queda auditado", async () => {
    const name = `Sector ${suffix}`;
    const { id } = await catalogs.createCatalogItem(rrhh, "sectores", { name, code: `s${suffix}` });
    expect(await lastAudit({ entityId: id })).toMatchObject({ action: "CREATE", entityType: "Department" });

    await catalogs.updateCatalogItem(rrhh, "sectores", id, { name: `${name} editado`, code: `s${suffix}` });
    const update = await lastAudit({ entityId: id });
    expect(update).toMatchObject({ action: "UPDATE" });
    expect(update?.before).toEqual({ name });

    await catalogs.setCatalogItemActive(rrhh, "sectores", id, false);
    const list = await catalogs.listCatalog(rrhh, "sectores", { q: suffix });
    expect(list.items.find((i) => i.id === id)).toBeUndefined();
    const inactive = await catalogs.listCatalog(rrhh, "sectores", { q: suffix, status: "inactivos" });
    expect(inactive.items.map((i) => i.id)).toContain(id);
    expect(await db.department.count({ where: { id } })).toBe(1);
  });

  it("informa el campo duplicado en español", async () => {
    const name = `Duplicado ${suffix}`;
    await catalogs.createCatalogItem(rrhh, "art", { name });
    const error = await appErrorOf(catalogs.createCatalogItem(rrhh, "art", { name }));
    expect(error).toBeInstanceOf(ConflictError);
    expect(error?.message).toBe("Ya existe un registro con ese nombre.");
  });

  it("no distingue mayúsculas al controlar nombres repetidos", async () => {
    await catalogs.createCatalogItem(rrhh, "sectores", { name: `Mayúsculas ${suffix}` });
    const error = await appErrorOf(catalogs.createCatalogItem(rrhh, "sectores", { name: `MAYÚSCULAS ${suffix}` }));
    expect(error).toBeInstanceOf(ConflictError);
    expect(error).toMatchObject({ fieldErrors: { name: ["Ya existe un registro con ese nombre."] } });
  });

  it("no permite repetir el código de una lista ni cambiarlo después", async () => {
    const code = `X_${suffix.toUpperCase()}`;
    const { id } = await catalogs.createCatalogItem(rrhh, "motivos-egreso", { label: "Motivo de prueba", code });
    await expect(catalogs.createCatalogItem(rrhh, "motivos-egreso", { label: "Otro", code })).rejects.toBeInstanceOf(
      ConflictError,
    );

    await catalogs.updateCatalogItem(rrhh, "motivos-egreso", id, { label: "Motivo renombrado", code: "CAMBIADO" });
    const row = await db.lookupValue.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ label: "Motivo renombrado", code, group: "MOTIVO_EGRESO" });
  });

  it("no permite la misma categoría dos veces sin convenio", async () => {
    const name = `Categoría ${suffix}`;
    await catalogs.createCatalogItem(rrhh, "categorias", { name, agreementId: "" });
    await expect(
      catalogs.createCatalogItem(rrhh, "categorias", { name: name.toUpperCase(), agreementId: "" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("muestra la etiqueta de las referencias en el listado", async () => {
    const dept = await catalogs.createCatalogItem(rrhh, "sectores", { name: `Ref ${suffix}`, code: "" });
    await catalogs.createCatalogItem(rrhh, "puestos", { name: `Puesto ${suffix}`, departmentId: dept.id });
    const list = await catalogs.listCatalog(rrhh, "puestos", { q: `Puesto ${suffix}` });
    expect(list.items[0]?.display.departmentId).toBe(`Ref ${suffix}`);
  });

  it("Consulta no puede administrar catálogos", async () => {
    await expect(catalogs.listCatalog(consulta, "sectores", {})).rejects.toBeInstanceOf(ForbiddenError);
    await expect(catalogs.createCatalogItem(consulta, "sectores", { name: "X" })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

describe("empresa", () => {
  it("valida el CUIT, guarda solo dígitos y audita los cambios", async () => {
    await expect(company.saveCompany(admin, { legalName: "Empresa", cuit: "30-71234567-0" })).rejects.toBeInstanceOf(
      Error,
    );
    await company.saveCompany(admin, { legalName: "Empresa de prueba S.A.", cuit: "30-71234567-1" });
    const saved = await company.getCompany(admin);
    expect(saved).toMatchObject({ legalName: "Empresa de prueba S.A.", cuit: "30712345671", tradeName: null });

    await company.saveCompany(admin, { legalName: "Empresa de prueba S.A.", tradeName: "Prueba", cuit: "30712345671" });
    const audit = await lastAudit({ entityId: saved!.id });
    expect(audit).toMatchObject({ action: "UPDATE", after: { tradeName: "Prueba" } });
    expect(await db.company.count()).toBe(1);
  });

  it("RRHH no puede editar los datos de la empresa", async () => {
    await expect(company.saveCompany(rrhh, { legalName: "X", cuit: "30712345671" })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

describe("parámetros", () => {
  it("guarda los parámetros de seguridad y los usa enseguida", async () => {
    const current = await getSetting("security");
    try {
      await settings.saveSetting(admin, "security", { ...current, maxFailedLogins: 7 });
      expect((await getSetting("security")).maxFailedLogins).toBe(7);
      const audit = await lastAudit({ entityId: "security" });
      expect(audit).toMatchObject({ action: "UPDATE", after: { maxFailedLogins: 7 } });
      expect(audit?.before).toEqual({ maxFailedLogins: current.maxFailedLogins });
    } finally {
      await settings.saveSetting(admin, "security", current);
    }
  });

  it("rechaza valores fuera de rango", async () => {
    const current = await getSetting("security");
    const error = await appErrorOf(settings.saveSetting(admin, "security", { ...current, passwordMinLength: 4 }));
    expect(error).toBeInstanceOf(ValidationError);
  });
});

describe("feriados", () => {
  it("no permite dos feriados en la misma fecha y permite quitarlos con auditoría", async () => {
    const { id } = await holidays.createHoliday(rrhh, { date: "2099-05-25", name: "Feriado de prueba" });
    const error = await appErrorOf(holidays.createHoliday(rrhh, { date: "2099-05-25", name: "Otro" }));
    expect(error).toBeInstanceOf(ConflictError);
    expect(error?.message).toBe("Ya hay un feriado cargado en esa fecha.");

    const list = await holidays.listHolidays(rrhh, { year: "2099" });
    expect(list.items.map((h) => h.id)).toContain(id);

    await holidays.deleteHoliday(rrhh, id);
    expect(await lastAudit({ entityId: id })).toMatchObject({
      action: "DELETE",
      before: { name: "Feriado de prueba" },
    });
  });

  it("rechaza fechas inexistentes", async () => {
    await expect(holidays.createHoliday(rrhh, { date: "2099-02-30", name: "X" })).rejects.toBeInstanceOf(Error);
  });
});

describe("horarios", () => {
  const week = (enabled: number[], start = "09:00", end = "18:00", breakMinutes = 60) =>
    Array.from({ length: 7 }, (_, i) => ({
      dayOfWeek: i + 1,
      enabled: enabled.includes(i + 1),
      startTime: start,
      endTime: end,
      breakMinutes,
    }));

  it("calcula las horas semanales y reemplaza los días al editar", async () => {
    const name = `Horario ${suffix}`;
    const { id } = await schedules.createSchedule(rrhh, { name, workModalityId: "", days: week([1, 2, 3, 4, 5]) });
    let saved = await db.workSchedule.findUniqueOrThrow({ where: { id }, include: { days: true } });
    expect(saved.weeklyHours.toString()).toBe("40");
    expect(saved.days).toHaveLength(5);

    await schedules.updateSchedule(rrhh, id, { name, workModalityId: "", days: week([6, 7], "22:00", "06:00", 0) });
    saved = await db.workSchedule.findUniqueOrThrow({ where: { id }, include: { days: true } });
    expect(saved.weeklyHours.toString()).toBe("16");
    expect(saved.days.map((d) => d.dayOfWeek).sort()).toEqual([6, 7]);
    expect(saved.days.every((d) => d.crossesMidnight)).toBe(true);
    expect(await lastAudit({ entityId: id })).toMatchObject({ action: "UPDATE" });
  });
});

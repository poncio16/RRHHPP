import { beforeAll, describe, expect, it } from "vitest";
import { saveSetting } from "@/features/settings/service";
import { getSetupChecklist, setupAccess } from "@/features/system/service";
import type { Permission } from "@/server/authz";
import { ADMIN_ROLE } from "@/server/authz/roles";
import type { ActorContext } from "@/server/context";
import { db } from "@/server/db";
import { defaultSetting } from "@/server/settings";
import { actorFor, createTestUser } from "./helpers";

let admin: ActorContext;
let rrhh: ActorContext;
let consulta: ActorContext;
let configOnly: ActorContext;
let noPersonal: ActorContext;

// Años sin feriados de otras pruebas: el resultado no depende de la fecha en que se corre.
const YEAR = 2987;
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const december = d(`${YEAR}-12-20`);
const june = d(`${YEAR}-06-01`);
const keys = async (ctx: ActorContext, today: Date) => (await getSetupChecklist(ctx, today)).steps.map((s) => s.key);

async function roleWith(name: string, permissions: Permission[]) {
  const code = `${name}_${Date.now().toString(36)}`.toUpperCase();
  await db.role.create({
    data: { code, name: `${name} ${code}`, permissions: { create: permissions.map((permission) => ({ permission })) } },
  });
  return actorFor((await createTestUser(code)).id);
}

/**
 * Las otras pruebas dejan cargada la empresa y varios administradores: durante
 * `fn` no hay empresa y queda un solo administrador activo. Después se restaura.
 */
async function withoutCompanyAndSingleAdmin(fn: () => Promise<void>) {
  const company = await db.company.findFirst();
  const others = (
    await db.user.findMany({
      where: { isActive: true, role: { code: ADMIN_ROLE }, id: { not: admin.userId } },
      select: { id: true },
    })
  ).map((u) => u.id);
  if (company) await db.company.delete({ where: { id: company.id } });
  await db.user.updateMany({ where: { id: { in: others } }, data: { isActive: false } });
  try {
    await fn();
  } finally {
    await db.user.updateMany({ where: { id: { in: others } }, data: { isActive: true } });
    if (company) await db.company.create({ data: company });
  }
}

beforeAll(async () => {
  admin = await actorFor((await createTestUser(ADMIN_ROLE)).id);
  rrhh = await actorFor((await createTestUser("RRHH")).id);
  consulta = await actorFor((await createTestUser("CONSULTA")).id);
  configOnly = await roleWith("SOLO_PARAMETROS", ["config:manage"]);
  noPersonal = await roleWith("SIN_PERSONALES", ["employee:read", "employee:write", "import:run"]);
});

describe("inicio: puesta en marcha", () => {
  it("cada paso pide el permiso de la pantalla a la que lleva", () => {
    expect(setupAccess(admin)).toEqual({
      company: true,
      catalogs: true,
      users: true,
      newEmployee: true,
      importer: true,
    });
    expect(setupAccess(rrhh)).toEqual({
      company: false,
      catalogs: true,
      users: false,
      newEmployee: true,
      importer: true,
    });
    expect(Object.values(setupAccess(consulta))).not.toContain(true);
    // Sin ver datos personales no se puede dar de alta un legajo ni importar.
    expect(setupAccess(noPersonal)).toMatchObject({ newEmployee: false, importer: false });
    expect(setupAccess(configOnly)).toEqual({
      company: true,
      catalogs: false,
      users: false,
      newEmployee: false,
      importer: false,
    });
  });

  it("muestra a cada rol solo los pasos que puede resolver", async () => {
    await withoutCompanyAndSingleAdmin(async () => {
      const forAdmin = await getSetupChecklist(admin, december);
      expect(forAdmin.title).toBe("Puesta en marcha");
      expect(forAdmin.steps.map((s) => s.key)).toEqual(
        expect.arrayContaining(["empresa", `feriados-${YEAR}`, `feriados-${YEAR + 1}`, "administrador"]),
      );
      expect(forAdmin.review).toEqual({ leaveTypes: true });

      // RRHH carga catálogos y feriados, pero no la empresa ni los usuarios.
      const forRrhh = await getSetupChecklist(rrhh, december);
      expect(forRrhh.steps.map((s) => s.key)).toEqual(
        expect.arrayContaining([`feriados-${YEAR}`, `feriados-${YEAR + 1}`]),
      );
      expect(forRrhh.steps.map((s) => s.key)).not.toContain("empresa");
      expect(forRrhh.steps.map((s) => s.key)).not.toContain("administrador");
      expect(forRrhh.review).toBeNull();

      expect(await getSetupChecklist(consulta, december)).toEqual({
        title: "Configuración pendiente",
        steps: [],
        review: null,
      });

      // Con parámetros pero sin catálogos: la empresa sí, los tipos de licencia no.
      const forConfig = await getSetupChecklist(configOnly, december);
      expect(forConfig.steps.map((s) => s.key)).toEqual(["empresa"]);
      expect(forConfig.review).toEqual({ leaveTypes: false });
    });
  });

  it("el segundo administrador deja de pedirse con dos activos", async () => {
    await withoutCompanyAndSingleAdmin(async () => {
      expect(await keys(admin, june)).toContain("administrador");
      const second = await createTestUser(ADMIN_ROLE);
      expect(await keys(admin, june)).not.toContain("administrador");
      await db.user.update({ where: { id: second.id }, data: { isActive: false } });
      expect(await keys(admin, june)).toContain("administrador");
    });
  });

  it("los feriados de cada año desaparecen al cargar los de ese año", async () => {
    const next = await db.holiday.create({ data: { date: d(`${YEAR + 1}-01-01`), name: "Año nuevo de prueba" } });
    try {
      const steps = await keys(rrhh, december);
      expect(steps).toContain(`feriados-${YEAR}`);
      expect(steps).not.toContain(`feriados-${YEAR + 1}`);
    } finally {
      await db.holiday.delete({ where: { id: next.id } });
    }
    // El último día del año cuenta como de ese año.
    const current = await db.holiday.create({ data: { date: d(`${YEAR}-12-31`), name: "Feriado de prueba" } });
    try {
      const steps = await keys(rrhh, december);
      expect(steps).not.toContain(`feriados-${YEAR}`);
      expect(steps).toContain(`feriados-${YEAR + 1}`);
    } finally {
      await db.holiday.delete({ where: { id: current.id } });
    }
  });

  it("los del año siguiente se piden recién dentro de la anticipación configurada", async () => {
    // A mitad de año todavía no corresponde avisar.
    expect(await keys(rrhh, june)).not.toContain(`feriados-${YEAR + 1}`);
    expect(await keys(rrhh, december)).toContain(`feriados-${YEAR + 1}`);

    const previous = await db.setting.findUnique({ where: { key: "alerts" } });
    try {
      await saveSetting(admin, "alerts", { ...defaultSetting("alerts"), nextYearHolidaysDays: 0 });
      expect(await keys(rrhh, december)).not.toContain(`feriados-${YEAR + 1}`);
      await saveSetting(admin, "alerts", { ...defaultSetting("alerts"), nextYearHolidaysDays: 120 });
      expect(await keys(rrhh, d(`${YEAR}-09-15`))).toContain(`feriados-${YEAR + 1}`);
    } finally {
      if (previous) await db.setting.update({ where: { key: "alerts" }, data: { value: previous.value ?? {} } });
      else await db.setting.delete({ where: { key: "alerts" } });
    }
  });
});

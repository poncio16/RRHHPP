import { weeklyHours } from "../../src/features/schedules/calc";
import type { PrismaClient } from "../../src/generated/prisma/client";

/**
 * Empresa y catálogos de demostración. Los nombres de empresa, sectores,
 * convenio, obras sociales y ART son ficticios. Los bancos son reales porque
 * su código de entidad se usa para validar el CBU (verificarlos con el BCRA
 * antes de usar el sistema en producción).
 *
 * Solo crea lo que falta: nunca pisa datos editados desde la aplicación.
 * No se cargan feriados: dependen del calendario oficial de cada año.
 */

const DEPARTMENTS = [
  { name: "Administración", code: "ADM" },
  { name: "Comercial", code: "COM" },
  { name: "Depósito", code: "DEP" },
  { name: "Logística", code: "LOG" },
  { name: "Recursos Humanos", code: "RRHH" },
  { name: "Sistemas", code: "SIS" },
];

const POSITIONS: { name: string; department: string }[] = [
  { name: "Analista administrativo", department: "Administración" },
  { name: "Asistente contable", department: "Administración" },
  { name: "Vendedor", department: "Comercial" },
  { name: "Jefe de ventas", department: "Comercial" },
  { name: "Operario de depósito", department: "Depósito" },
  { name: "Encargado de depósito", department: "Depósito" },
  { name: "Chofer", department: "Logística" },
  { name: "Analista de RRHH", department: "Recursos Humanos" },
  { name: "Soporte técnico", department: "Sistemas" },
];

const AGREEMENT = { name: "Convenio de demostración", unionName: "Sindicato de demostración" };
const CATEGORIES = [
  "Administrativo A",
  "Administrativo B",
  "Vendedor A",
  "Vendedor B",
  "Maestranza A",
  "Fuera de convenio",
];

const BANKS = [
  { code: "007", name: "Banco de Galicia y Buenos Aires" },
  { code: "011", name: "Banco de la Nación Argentina" },
  { code: "014", name: "Banco de la Provincia de Buenos Aires" },
  { code: "015", name: "Industrial and Commercial Bank of China (ICBC)" },
  { code: "017", name: "BBVA Argentina" },
  { code: "029", name: "Banco de la Ciudad de Buenos Aires" },
  { code: "034", name: "Banco Patagonia" },
  { code: "044", name: "Banco Hipotecario" },
  { code: "072", name: "Banco Santander Argentina" },
  { code: "191", name: "Banco Credicoop Cooperativo" },
  { code: "285", name: "Banco Macro" },
];

const CONTRACT_TYPES = [
  { name: "Tiempo indeterminado", hasEndDate: false },
  { name: "Plazo fijo", hasEndDate: true },
  { name: "Eventual", hasEndDate: true },
  { name: "Tiempo parcial", hasEndDate: false },
];

const WORKDAY_TYPES = [
  { name: "Jornada completa", weeklyHours: "45.00" },
  { name: "Jornada parcial", weeklyHours: "24.00" },
];

const HEALTH_INSURERS = ["Obra Social Demo del Comercio", "Obra Social Demo de Empleados", "Prepaga Demo Salud"];
const ART_PROVIDERS = ["ART Demo Seguros"];

const WORKPLACES = [
  {
    name: "Casa central",
    addressLine: "Av. Demostración 1234",
    city: "Ciudad Autónoma de Buenos Aires",
    province: "AR-C",
  },
  { name: "Depósito Avellaneda", addressLine: "Calle Ficticia 567", city: "Avellaneda", province: "AR-B" },
];

const SCHEDULES = [
  { name: "Administración L a V", days: [1, 2, 3, 4, 5], start: "09:00", end: "18:00", breakMinutes: 60 },
  { name: "Depósito L a S", days: [1, 2, 3, 4, 5, 6], start: "07:00", end: "14:30", breakMinutes: 30 },
];

const sorted = <T>(items: T[]) => items.map((item, sortOrder) => ({ ...item, sortOrder }));

export async function seedOrganization(db: PrismaClient) {
  await db.department.createMany({ data: sorted(DEPARTMENTS), skipDuplicates: true });
  const departments = new Map((await db.department.findMany()).map((d) => [d.name, d.id]));
  await db.position.createMany({
    data: sorted(POSITIONS).map(({ name, department, sortOrder }) => ({
      name,
      sortOrder,
      departmentId: departments.get(department) ?? null,
    })),
    skipDuplicates: true,
  });

  let agreement = await db.collectiveAgreement.findFirst({ where: { name: AGREEMENT.name } });
  agreement ??= await db.collectiveAgreement.create({ data: AGREEMENT });
  const existingCategories = new Set(
    (await db.category.findMany({ where: { agreementId: agreement.id } })).map((c) => c.name),
  );
  await db.category.createMany({
    data: sorted(CATEGORIES.map((name) => ({ name })))
      .filter((c) => !existingCategories.has(c.name))
      .map((c) => ({ ...c, agreementId: agreement.id })),
  });

  await db.bank.createMany({ data: sorted(BANKS), skipDuplicates: true });
  await db.contractType.createMany({ data: sorted(CONTRACT_TYPES), skipDuplicates: true });
  await db.workdayType.createMany({ data: sorted(WORKDAY_TYPES), skipDuplicates: true });
  await db.artProvider.createMany({ data: sorted(ART_PROVIDERS.map((name) => ({ name }))), skipDuplicates: true });

  const insurers = new Set((await db.healthInsurer.findMany()).map((h) => h.name));
  await db.healthInsurer.createMany({
    data: sorted(HEALTH_INSURERS.map((name) => ({ name }))).filter((h) => !insurers.has(h.name)),
  });

  const provinces = new Map((await db.province.findMany()).map((p) => [p.code, p.id]));
  await db.workplace.createMany({
    data: sorted(WORKPLACES).map(({ province, ...w }) => ({ ...w, provinceId: provinces.get(province) ?? null })),
    skipDuplicates: true,
  });

  const presencial = await db.lookupValue.findUnique({
    where: { group_code: { group: "MODALIDAD_TRABAJO", code: "PRESENCIAL" } },
  });
  for (const [sortOrder, s] of SCHEDULES.entries()) {
    if (await db.workSchedule.findUnique({ where: { name: s.name } })) continue;
    const days = s.days.map((dayOfWeek) => ({
      dayOfWeek,
      startTime: s.start,
      endTime: s.end,
      breakMinutes: s.breakMinutes,
    }));
    await db.workSchedule.create({
      data: {
        name: s.name,
        sortOrder,
        workModalityId: presencial?.id ?? null,
        weeklyHours: weeklyHours(days),
        days: { create: days },
      },
    });
  }

  if ((await db.company.count()) === 0) {
    await db.company.create({
      data: {
        legalName: "Distribuidora Demo S.A.",
        tradeName: "Distribuidora Demo",
        cuit: "30712345671",
        addressLine: "Av. Demostración 1234",
        city: "Ciudad Autónoma de Buenos Aires",
        postalCode: "C1000",
        provinceId: provinces.get("AR-C") ?? null,
        defaultArtProviderId: (await db.artProvider.findFirst({ where: { name: ART_PROVIDERS[0] } }))?.id ?? null,
        defaultWorkplaceId: (await db.workplace.findFirst({ where: { name: WORKPLACES[0]!.name } }))?.id ?? null,
      },
    });
  }
}

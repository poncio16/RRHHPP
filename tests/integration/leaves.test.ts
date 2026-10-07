import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as leaves from "@/features/leaves/service";
import { RESERVED_TYPE_LABEL } from "@/features/leaves/constants";
import * as vacations from "@/features/vacations/service";
import type { ActorContext } from "@/server/context";
import { db } from "@/server/db";
import { BusinessRuleError, ConflictError, ForbiddenError, toAppError, ValidationError } from "@/server/errors";
import { actorFor, createTestUser, lastAudit } from "./helpers";

let admin: ActorContext;
let rrhh: ActorContext;
let administracion: ActorContext;
let consulta: ActorContext;
const tag = Date.now().toString(36);
const refs = {} as Record<
  "employee" | "other" | "study" | "sick" | "vacation" | "suspension" | "inactive" | "balance",
  string
>;

// Fechas lejanas para no chocar con los datos de otros archivos de test.
// 2031-03-03 es lunes; el 2031-03-05 se carga como feriado.
const HOLIDAY = "2031-03-05";

async function appErrorOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return toAppError(error);
  }
  throw new Error("Se esperaba un error");
}

async function version(id: string) {
  return (await db.leaveRecord.findUniqueOrThrow({ where: { id } })).updatedAt.toISOString();
}

async function createEmployee(name: string, scheduleId: string | null) {
  const province = await db.province.upsert({
    where: { code: "AR-X" },
    update: {},
    create: { code: "AR-X", name: "Santa Cruz" },
  });
  return db.employee.create({
    data: {
      fileNumber: 800_000 + Math.floor(Math.random() * 90_000),
      lastName: "Licencias",
      firstName: `${name} ${tag}`,
      dni: String(10_000_000 + Math.floor(Math.random() * 9_000_000)),
      cuil: `27${Math.floor(Math.random() * 1e9)}`.padEnd(11, "0").slice(0, 11),
      birthDate: new Date("1990-01-01"),
      sex: "F",
      addressLine: "Calle 1",
      city: "Ciudad",
      provinceId: province.id,
      postalCode: "9400",
      hireDate: new Date("2020-01-01"),
      seniorityDate: new Date("2020-01-01"),
      workScheduleId: scheduleId,
      departmentId: (await db.department.create({ data: { name: `Lic sector ${name} ${tag}` } })).id,
      positionId: (await db.position.create({ data: { name: `Lic puesto ${name} ${tag}` } })).id,
      contractTypeId: (await db.contractType.create({ data: { name: `Lic contrato ${name} ${tag}` } })).id,
      workplaceId: (await db.workplace.create({ data: { name: `Lic lugar ${name} ${tag}` } })).id,
    },
  });
}

beforeAll(async () => {
  admin = await actorFor((await createTestUser("ADMIN")).id);
  rrhh = await actorFor((await createTestUser("RRHH")).id);
  administracion = await actorFor((await createTestUser("ADMINISTRACION")).id);
  consulta = await actorFor((await createTestUser("CONSULTA")).id);

  // Lunes a viernes.
  const schedule = await db.workSchedule.create({
    data: {
      name: `Lic horario ${tag}`,
      weeklyHours: "40",
      days: {
        create: [1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, startTime: "09:00", endTime: "17:00" })),
      },
    },
  });
  refs.employee = (await createEmployee("Ana", schedule.id)).id;
  refs.other = (await createEmployee("Beto", null)).id;
  await db.holiday.upsert({
    where: { date: new Date(HOLIDAY) },
    update: { isNonWorkingOptional: false },
    create: { date: new Date(HOLIDAY), name: "Feriado de prueba" },
  });

  const type = (data: { name: string } & Record<string, unknown>) =>
    db.leaveType.create({
      data: { class: "LICENCIA", countingMode: "CORRIDOS", ...data, name: `${data.name} ${tag}` },
    });
  refs.study = (await type({ name: "Examen", maxDaysPerEvent: 2 })).id;
  refs.sick = (
    await type({ name: "Enfermedad", countingMode: "HABILES", isSensitive: true, requiresCertificate: true })
  ).id;
  refs.vacation = (await type({ name: "Vacaciones", class: "VACACIONES", countingMode: "HABILES" })).id;
  refs.suspension = (await type({ name: "Suspensión", class: "SUSPENSION" })).id;
  refs.inactive = (await type({ name: "Vieja", isActive: false })).id;
  refs.balance = (
    await db.vacationBalance.create({ data: { employeeId: refs.employee, year: 2030, entitledDays: 5 } })
  ).id;
});

afterAll(async () => {
  await db.$disconnect();
});

const period = (start: string, end: string, extra: Record<string, unknown> = {}) => ({
  leaveTypeId: refs.study,
  startDate: start,
  endDate: end,
  notes: "",
  ...extra,
});

describe("conteo de días", () => {
  it("en días hábiles usa el horario del empleado y saltea los feriados", async () => {
    // Lunes 3 a domingo 9 de marzo de 2031: 5 días de horario menos el feriado del miércoles.
    const preview = await leaves.previewLeave(rrhh, {
      employeeId: refs.employee,
      leaveTypeId: refs.sick,
      startDate: "2031-03-03",
      endDate: "2031-03-09",
    });
    expect(preview?.days).toBe(4);
    expect(preview?.problems).toEqual([]);
  });

  it("sin horario usa los días hábiles del parámetro (lunes a viernes por defecto)", async () => {
    const preview = await leaves.previewLeave(rrhh, {
      employeeId: refs.other,
      leaveTypeId: refs.sick,
      startDate: "2031-03-03",
      endDate: "2031-03-09",
    });
    expect(preview?.days).toBe(4);
  });

  it("en días corridos cuenta todos e informa los topes configurados como aviso", async () => {
    const preview = await leaves.previewLeave(rrhh, {
      employeeId: refs.employee,
      leaveTypeId: refs.study,
      startDate: "2031-03-03",
      endDate: "2031-03-05",
    });
    expect(preview?.days).toBe(3);
    expect(preview?.warnings[0]).toMatch(/máximo configurado de 2 días/);
  });
});

describe("registro, aprobación y anulación", () => {
  let requestId: string;

  it("RRHH registra una solicitud con los días calculados y queda en la auditoría", async () => {
    const result = await leaves.createLeave(rrhh, refs.employee, period("2031-04-07", "2031-04-09"));
    requestId = result.id;
    expect(result.warnings).toHaveLength(1);
    const record = await db.leaveRecord.findUniqueOrThrow({ where: { id: requestId } });
    expect(record).toMatchObject({ status: "SOLICITADA", days: 3, requestedById: rrhh.userId });
    expect(await lastAudit({ entityId: requestId })).toMatchObject({ action: "CREATE", module: "licencias" });
  });

  it("rechaza un período que se superpone con otro vigente", async () => {
    const error = await appErrorOf(leaves.createLeave(rrhh, refs.employee, period("2031-04-09", "2031-04-10")));
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).fieldErrors.startDate?.[0]).toMatch(/Se superpone con examen/);
  });

  it("rechaza fechas anteriores al ingreso, tipos inactivos y fechas invertidas", async () => {
    const before = await appErrorOf(leaves.createLeave(rrhh, refs.employee, period("2019-12-30", "2020-01-02")));
    expect((before as ValidationError).fieldErrors.startDate?.[0]).toMatch(/anterior al ingreso/);
    const inactive = await appErrorOf(
      leaves.createLeave(rrhh, refs.employee, period("2031-05-05", "2031-05-05", { leaveTypeId: refs.inactive })),
    );
    expect((inactive as ValidationError).fieldErrors.leaveTypeId).toBeDefined();
    const inverted = await appErrorOf(leaves.createLeave(rrhh, refs.employee, period("2031-05-06", "2031-05-05")));
    expect(inverted).toBeInstanceOf(ValidationError);
  });

  it("Administración y Consulta solo leen; no pueden registrar ni aprobar", async () => {
    expect(
      await appErrorOf(leaves.createLeave(administracion, refs.employee, period("2031-06-02", "2031-06-02"))),
    ).toBeInstanceOf(ForbiddenError);
    const v = await version(requestId);
    expect(
      await appErrorOf(leaves.decideLeave(consulta, requestId, { version: v, decision: "APROBADA" })),
    ).toBeInstanceOf(ForbiddenError);
    const list = await leaves.listLeaves(consulta, {}, { employeeId: refs.employee });
    expect(list.items.map((i) => i.id)).toContain(requestId);
  });

  it("solo quien puede aprobar registra directamente como aprobada", async () => {
    const result = await leaves.createLeave(rrhh, refs.employee, period("2031-06-02", "2031-06-02", { approve: true }));
    expect((await db.leaveRecord.findUniqueOrThrow({ where: { id: result.id } })).status).toBe("APROBADA");
  });

  it("el rechazo exige motivo y la aprobación registra quién decidió", async () => {
    const missing = await appErrorOf(
      leaves.decideLeave(rrhh, requestId, { version: await version(requestId), decision: "RECHAZADA" }),
    );
    expect((missing as ValidationError).fieldErrors.notes?.[0]).toMatch(/motivo del rechazo/);

    await leaves.decideLeave(rrhh, requestId, { version: await version(requestId), decision: "APROBADA", notes: "" });
    const record = await db.leaveRecord.findUniqueOrThrow({ where: { id: requestId } });
    expect(record).toMatchObject({ status: "APROBADA", decidedById: rrhh.userId });
    expect(record.decidedAt).not.toBeNull();

    const again = await appErrorOf(
      leaves.decideLeave(rrhh, requestId, { version: await version(requestId), decision: "APROBADA" }),
    );
    expect(again).toBeInstanceOf(ConflictError);
  });

  it("detecta una edición simultánea por la versión", async () => {
    const stale = new Date(Date.now() - 60_000).toISOString();
    const error = await appErrorOf(leaves.annulLeave(rrhh, requestId, { version: stale, reason: "Error de carga" }));
    expect(error?.message).toMatch(/Otra persona modificó/);
  });

  it("anular no borra: guarda el motivo, audita y libera el período", async () => {
    await leaves.annulLeave(rrhh, requestId, { version: await version(requestId), reason: "Cargada por error" });
    const record = await db.leaveRecord.findUniqueOrThrow({ where: { id: requestId } });
    expect(record.status).toBe("ANULADA");
    expect(record.decisionNotes).toMatch(/Cargada por error/);
    expect(await lastAudit({ entityId: requestId })).toMatchObject({ action: "SOFT_DELETE" });
    const reused = await leaves.createLeave(rrhh, refs.employee, period("2031-04-08", "2031-04-08"));
    expect(reused.id).toBeDefined();
  });
});

describe("datos de salud", () => {
  let sickId: string;

  beforeAll(async () => {
    sickId = (
      await leaves.createLeave(rrhh, refs.employee, {
        ...period("2031-07-07", "2031-07-08"),
        leaveTypeId: refs.sick,
        notes: "Gripe",
      })
    ).id;
  });

  it("sin permiso de datos de salud el tipo se ve reservado y sin observaciones", async () => {
    const list = await leaves.listLeaves(administracion, {}, { employeeId: refs.employee });
    const item = list.items.find((i) => i.id === sickId)!;
    expect(item).toMatchObject({ hidden: true, notes: null, formValues: null });
    expect(item.leaveType.name).toBe(RESERVED_TYPE_LABEL);
    const options = await leaves.getLeaveTypeOptions(administracion);
    expect(options.map((o) => o.id)).not.toContain(refs.sick);
  });

  it("filtrar por un tipo sensible sin permiso no devuelve registros", async () => {
    const list = await leaves.listLeaves(consulta, { leaveTypeId: refs.sick, status: "todas" });
    expect(list.total).toBe(0);
  });

  it("RRHH ve el tipo, las observaciones y el certificado pendiente", async () => {
    const list = await leaves.listLeaves(rrhh, {}, { employeeId: refs.employee });
    const item = list.items.find((i) => i.id === sickId)!;
    expect(item).toMatchObject({ hidden: false, notes: "Gripe", certificate: "FALTA" });
  });
});

describe("vacaciones", () => {
  it("exige el período de vacaciones y avisa si supera el saldo", async () => {
    const missing = await appErrorOf(
      leaves.createLeave(rrhh, refs.employee, { ...period("2031-08-04", "2031-08-08"), leaveTypeId: refs.vacation }),
    );
    expect((missing as ValidationError).fieldErrors.vacationBalanceId).toBeDefined();

    // Lunes 4 a viernes 15 de agosto: 10 días hábiles, el saldo es de 5.
    const result = await leaves.createLeave(rrhh, refs.employee, {
      ...period("2031-08-04", "2031-08-15"),
      leaveTypeId: refs.vacation,
      vacationBalanceId: refs.balance,
    });
    expect(result.warnings.join(" ")).toMatch(/Supera el saldo disponible del período 2030/);

    const v = await version(result.id);
    const error = await appErrorOf(leaves.decideLeave(rrhh, result.id, { version: v, decision: "APROBADA" }));
    expect(error).toBeInstanceOf(ConflictError);
    expect(error?.message).toMatch(/No alcanza el saldo del período 2030/);

    // Ajuste con motivo y aprobación.
    const balanceVersion = (await db.vacationBalance.findUniqueOrThrow({ where: { id: refs.balance } })).updatedAt;
    const noReason = await appErrorOf(
      vacations.updateBalance(rrhh, refs.balance, {
        version: balanceVersion.toISOString(),
        adjustmentDays: "5",
        adjustmentReason: "",
        carriedOverDays: "0",
        notes: "",
      }),
    );
    expect((noReason as ValidationError).fieldErrors.adjustmentReason).toBeDefined();
    await vacations.updateBalance(rrhh, refs.balance, {
      version: balanceVersion.toISOString(),
      adjustmentDays: "5",
      adjustmentReason: "Acuerdo con el empleado",
      carriedOverDays: "0",
      notes: "",
    });
    await leaves.decideLeave(rrhh, result.id, { version: await version(result.id), decision: "APROBADA" });

    const [balance] = await vacations.listEmployeeBalances(rrhh, refs.employee);
    expect(balance).toMatchObject({ year: 2030, total: 10, used: 10, requested: 0, pending: 0 });
  });

  it("el total de un período no puede quedar por debajo de lo aprobado", async () => {
    const current = await db.vacationBalance.findUniqueOrThrow({ where: { id: refs.balance } });
    const error = await appErrorOf(
      vacations.updateBalance(rrhh, refs.balance, {
        version: current.updatedAt.toISOString(),
        adjustmentDays: "0",
        adjustmentReason: "",
        carriedOverDays: "0",
        notes: "",
      }),
    );
    expect(error).toBeInstanceOf(ConflictError);
  });

  it("solo quien administra parámetros cambia las reglas, y deben cubrir todas las antigüedades", async () => {
    const rules = [
      { minSeniorityYears: "0", maxSeniorityYears: "5", days: "14" },
      { minSeniorityYears: "5", maxSeniorityYears: "10", days: "21" },
      { minSeniorityYears: "10", maxSeniorityYears: "20", days: "28" },
      { minSeniorityYears: "20", maxSeniorityYears: "", days: "35" },
    ];
    expect(await appErrorOf(vacations.saveRules(rrhh, { rules }))).toBeInstanceOf(ForbiddenError);
    const gap = await appErrorOf(
      vacations.saveRules(admin, { rules: [rules[0], { ...rules[2]!, maxSeniorityYears: "" }] }),
    );
    expect((gap as ValidationError).fieldErrors["rules.1.minSeniorityYears"]?.[0]).toMatch(/empezar en 5 años/);
    await vacations.saveRules(admin, { rules });
    expect((await vacations.getRules(consulta)).map((r) => r.label)).toEqual([
      "Hasta 5 años",
      "Más de 5 y hasta 10 años",
      "Más de 10 y hasta 20 años",
      "Más de 20 años",
    ]);
  });

  it("genera los períodos que faltan según la antigüedad al corte, sin tocar los existentes", async () => {
    const preview = await vacations.previewGeneration(rrhh, { year: 2031 });
    const item = preview.items.find((i) => i.employee.id === refs.employee)!;
    // Antigüedad al 31/12/2031 desde el 1/1/2020: 11 años, 11 meses y 30 días → regla de 10 a 20 años.
    expect(item).toMatchObject({ days: 28, proportional: false, basis: "Más de 10 y hasta 20 años" });

    expect(await appErrorOf(vacations.generateBalances(consulta, { year: 2031 }))).toBeInstanceOf(ForbiddenError);
    const { created } = await vacations.generateBalances(rrhh, { year: 2031 });
    expect(created).toBeGreaterThanOrEqual(2);
    const balance = await db.vacationBalance.findUniqueOrThrow({
      where: { employeeId_year: { employeeId: refs.employee, year: 2031 } },
    });
    expect(balance.entitledDays).toBe(28);

    const again = await vacations.previewGeneration(rrhh, { year: 2031 });
    expect(again.items.find((i) => i.employee.id === refs.employee)).toBeUndefined();
  });

  it("sin reglas no genera nada y lo explica", async () => {
    const saved = await db.vacationRule.findMany();
    await db.vacationRule.deleteMany({});
    try {
      expect(await appErrorOf(vacations.previewGeneration(rrhh, { year: 2032 }))).toBeInstanceOf(BusinessRuleError);
    } finally {
      await db.vacationRule.createMany({ data: saved });
    }
  });
});

describe("suspensiones", () => {
  it("una suspensión aprobada que cubre hoy marca al empleado como suspendido", async () => {
    const today = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    await leaves.createLeave(rrhh, refs.other, {
      ...period(iso(new Date(today.getTime() - 86_400_000)), iso(new Date(today.getTime() + 86_400_000))),
      leaveTypeId: refs.suspension,
      approve: true,
    });
    const suspension = await leaves.getActiveSuspension(consulta, refs.other);
    expect(suspension).not.toBeNull();
    expect(await leaves.getActiveSuspension(consulta, refs.employee)).toBeNull();
  });
});

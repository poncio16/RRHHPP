import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as attendance from "@/features/attendance/service";
import * as novelties from "@/features/novelties/service";
import * as salaries from "@/features/salaries/service";
import type { NoveltyOrigin } from "@/generated/prisma/client";
import { todayInTimeZone, toIsoDate } from "@/lib/format";
import type { ActorContext } from "@/server/context";
import { db } from "@/server/db";
import { ConflictError, ForbiddenError, ValidationError } from "@/server/errors";
import { actorFor, createTestUser, lastAudit } from "./helpers";

let rrhh: ActorContext;
let administracion: ActorContext;
let consulta: ActorContext;
let onlyNovelties: ActorContext;
const tag = Date.now().toString(36);
const refs = {} as Record<
  | "department"
  | "employee"
  | "other"
  | "basic"
  | "discount"
  | "inactiveConcept"
  | "advance"
  | "absenceLeaveType"
  | "absenceNovelty"
  | "freeType",
  string
>;
const origin = {} as Record<NoveltyOrigin, string>;
let fileNumber = 0;

// Junio de 2025: el lunes 2 es el primer día hábil.
const PERIOD = "2025-06";

async function createEmployee(name: string, scheduleId: string) {
  const province = await db.province.upsert({
    where: { code: "AR-X" },
    update: {},
    create: { code: "AR-X", name: "Santa Cruz" },
  });
  return db.employee.create({
    data: {
      fileNumber: 800_000 + Math.floor(Math.random() * 90_000),
      lastName: "Remuneraciones",
      firstName: `${name} ${tag}`,
      dni: String(10_000_000 + Math.floor(Math.random() * 9_000_000)),
      cuil: `20${Math.floor(Math.random() * 1e9)}`.padEnd(11, "0").slice(0, 11),
      birthDate: new Date("1990-01-01"),
      sex: "F",
      addressLine: "Calle 1",
      city: "Ciudad",
      provinceId: province.id,
      postalCode: "9400",
      hireDate: new Date("2024-01-01"),
      seniorityDate: new Date("2024-01-01"),
      workScheduleId: scheduleId,
      departmentId: refs.department,
      positionId: (await db.position.create({ data: { name: `Rem puesto ${name} ${tag}` } })).id,
      contractTypeId: (await db.contractType.create({ data: { name: `Rem contrato ${name} ${tag}` } })).id,
      workplaceId: (await db.workplace.create({ data: { name: `Rem lugar ${name} ${tag}` } })).id,
    },
  });
}

/** Tipo de novedad generado desde un hecho (único en la base: se reutiliza entre corridas). */
async function originType(generatedFrom: NoveltyOrigin) {
  const found = await db.noveltyType.findUnique({ where: { generatedFrom } });
  if (found) {
    await db.noveltyType.update({ where: { id: found.id }, data: { isActive: true } });
    return found.id;
  }
  return (
    await db.noveltyType.create({ data: { name: `${generatedFrom} ${tag}`, nature: "INFORMATIVO", generatedFrom } })
  ).id;
}

async function errorOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Se esperaba un error");
}

const mine = (n: { employeeId?: string; employee?: string }) =>
  "employeeId" in n ? [refs.employee, refs.other].includes(n.employeeId!) : n.employee?.includes(tag);

beforeAll(async () => {
  rrhh = await actorFor((await createTestUser("RRHH")).id);
  administracion = await actorFor((await createTestUser("ADMINISTRACION")).id);
  consulta = await actorFor((await createTestUser("CONSULTA")).id);
  const role = await db.role.upsert({
    where: { code: "SOLO_NOVEDADES" },
    update: {},
    create: {
      code: "SOLO_NOVEDADES",
      name: "Solo novedades (test)",
      permissions: { create: [{ permission: "novelty:read" }] },
    },
  });
  onlyNovelties = await actorFor((await createTestUser(role.code)).id);

  refs.department = (await db.department.create({ data: { name: `Rem sector ${tag}` } })).id;
  const schedule = await db.workSchedule.create({
    data: {
      name: `Rem horario ${tag}`,
      weeklyHours: "40",
      days: {
        create: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
          dayOfWeek,
          startTime: "09:00",
          endTime: "18:00",
          breakMinutes: 60,
        })),
      },
    },
  });
  const employee = await createEmployee("Ana", schedule.id);
  refs.employee = employee.id;
  fileNumber = employee.fileNumber;
  refs.other = (await createEmployee("Beto", schedule.id)).id;

  refs.basic = (
    await db.salaryConceptType.create({ data: { name: `Básico ${tag}`, nature: "HABER", kind: "BASICO" } })
  ).id;
  refs.discount = (
    await db.salaryConceptType.create({ data: { name: `Descuentos ${tag}`, nature: "DESCUENTO", kind: "OTRO" } })
  ).id;
  refs.inactiveConcept = (
    await db.salaryConceptType.create({
      data: { name: `Viejo ${tag}`, nature: "HABER", kind: "OTRO", isActive: false },
    })
  ).id;
  refs.advance = (
    await db.noveltyType.create({ data: { name: `Adelanto ${tag}`, nature: "DESCUENTO", requiresAmount: true } })
  ).id;
  refs.freeType = (await db.noveltyType.create({ data: { name: `Otro ${tag}`, nature: "INFORMATIVO" } })).id;
  for (const key of ["HORAS_EXTRAS", "LLEGADAS_TARDE", "AUSENCIAS", "CAMBIO_SALARIAL", "CAMBIO_CATEGORIA"] as const) {
    origin[key] = await originType(key);
  }
  refs.absenceNovelty = (
    await db.noveltyType.create({ data: { name: `Ausencia lic ${tag}`, nature: "INFORMATIVO" } })
  ).id;
  refs.absenceLeaveType = (
    await db.leaveType.create({
      data: {
        name: `Ausencia con aviso ${tag}`,
        class: "AUSENCIA",
        countingMode: "CORRIDOS",
        generatesNoveltyTypeId: refs.absenceNovelty,
      },
    })
  ).id;
});

afterAll(async () => {
  await db.$disconnect();
});

describe("historial salarial", () => {
  it("registra básicos con fecha y audita; el vigente es el más reciente hasta hoy", async () => {
    await salaries.createSalaryChange(rrhh, refs.employee, {
      effectiveDate: "2024-01-01",
      basicSalary: "900.000",
      notes: "Ingreso",
    });
    const { id } = await salaries.createSalaryChange(rrhh, refs.employee, {
      effectiveDate: "2025-06-15",
      basicSalary: "972.000,00",
      notes: "",
    });
    expect(await lastAudit({ entityId: id })).toMatchObject({ action: "CREATE", module: "remuneraciones" });
    const { items, current } = await salaries.getEmployeeSalaries(administracion, refs.employee);
    expect(items.map((i) => i.basicSalary)).toEqual(["972000.00", "900000.00"]);
    expect(current?.basicSalary).toBe("972000.00");
    expect(items[0]?.variation).toBe("+8,0 %");
  });

  it("no admite fechas futuras, anteriores al ingreso ni repetidas", async () => {
    const tomorrow = new Date(todayInTimeZone().getTime() + 86_400_000);
    const future = await errorOf(
      salaries.createSalaryChange(rrhh, refs.employee, { effectiveDate: toIsoDate(tomorrow), basicSalary: "1" }),
    );
    expect(future).toBeInstanceOf(ValidationError);
    const before = await errorOf(
      salaries.createSalaryChange(rrhh, refs.employee, { effectiveDate: "2023-12-31", basicSalary: "1" }),
    );
    expect((before as ValidationError).fieldErrors.effectiveDate?.[0]).toMatch(/anterior al ingreso/);
    const repeated = await errorOf(
      salaries.createSalaryChange(rrhh, refs.employee, { effectiveDate: "2024-01-01", basicSalary: "1" }),
    );
    expect(repeated).toBeInstanceOf(ConflictError);
  });

  it("corrige importe sin cambiar la fecha y con bloqueo optimista", async () => {
    const [latest] = (await salaries.getEmployeeSalaries(rrhh, refs.employee)).items;
    await salaries.updateSalaryChange(rrhh, latest!.id, {
      ...latest!.formValues,
      basicSalary: "975000",
      version: latest!.version,
    });
    const moved = await errorOf(
      salaries.updateSalaryChange(rrhh, latest!.id, { ...latest!.formValues, effectiveDate: "2025-06-16" }),
    );
    expect(moved).toBeInstanceOf(ValidationError);
    const stale = await errorOf(
      salaries.updateSalaryChange(rrhh, latest!.id, {
        ...latest!.formValues,
        basicSalary: "980000",
        version: latest!.version,
      }),
    );
    expect(stale).toBeInstanceOf(ConflictError);
  });

  it("Administración consulta pero no registra; Consulta no ve salarios", async () => {
    await expect(
      salaries.createSalaryChange(administracion, refs.other, { effectiveDate: "2024-01-01", basicSalary: "1" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(salaries.getEmployeeSalaries(consulta, refs.employee)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(salaries.listPayrolls(consulta, {})).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("resúmenes informados", () => {
  const payroll = (extra: Record<string, unknown> = {}) => ({
    period: "2025-05",
    grossReported: "1.000.000",
    deductionsReported: "200.000",
    netReported: "800.000",
    notes: "",
    lines: [
      { conceptTypeId: refs.basic, description: "", quantity: "", amount: "1.000.000" },
      { conceptTypeId: refs.discount, description: "Varios", quantity: "", amount: "200.000" },
    ],
    ...extra,
  });

  it("guarda totales y renglones; avisa diferencias sin bloquear", async () => {
    const ok = await salaries.createPayroll(rrhh, refs.employee, payroll());
    expect(ok.warnings).toEqual([]);
    const withDiff = await salaries.createPayroll(rrhh, null, {
      ...payroll({ netReported: "790.000" }),
      employeeId: refs.other,
    });
    expect(withDiff.warnings).toHaveLength(1);
    const list = await salaries.listPayrolls(administracion, { periodo: "2025-05", q: String(fileNumber) });
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({ grossReported: "1000000.00", warnings: [] });
    expect(list.items[0]?.lines.map((l) => l.amount)).toEqual(["1000000.00", "200000.00"]);
    const flagged = await salaries.listPayrolls(rrhh, { periodo: "2025-05", revisar: "si", sector: refs.department });
    expect(flagged.items.map((i) => i.employee.id)).toEqual([refs.other]);
  });

  it("uno por período; sin meses futuros ni conceptos desactivados", async () => {
    expect(await errorOf(salaries.createPayroll(rrhh, refs.employee, payroll()))).toBeInstanceOf(ConflictError);
    const future = await errorOf(salaries.createPayroll(rrhh, refs.employee, payroll({ period: "2999-01" })));
    expect((future as ValidationError).fieldErrors.period).toBeDefined();
    const inactive = await errorOf(
      salaries.createPayroll(
        rrhh,
        refs.employee,
        payroll({
          period: "2025-04",
          lines: [{ conceptTypeId: refs.inactiveConcept, description: "", quantity: "", amount: "1" }],
        }),
      ),
    );
    expect((inactive as ValidationError).fieldErrors["lines.0.conceptTypeId"]).toEqual([
      "El concepto está desactivado.",
    ]);
  });

  it("al modificar se reemplazan los renglones y se audita el cambio", async () => {
    const [record] = await salaries.getEmployeePayrolls(rrhh, refs.employee);
    await salaries.updatePayroll(rrhh, record!.id, {
      ...record!.formValues,
      lines: [record!.formValues.lines[0]],
      deductionsReported: "0",
      netReported: "1.000.000",
      version: record!.version,
    });
    const [updated] = await salaries.getEmployeePayrolls(rrhh, refs.employee);
    expect(updated?.lines).toHaveLength(1);
    expect(updated?.warnings).toEqual([]);
    const audit = await lastAudit({ entityId: record!.id });
    expect(audit?.action).toBe("UPDATE");
    expect((audit?.after as { netReported: string }).netReported).toBe("1000000.00");
  });
});

describe("novedades manuales", () => {
  const manual = (extra: Record<string, unknown> = {}) => ({
    noveltyTypeId: refs.advance,
    date: "2025-06-10",
    period: PERIOD,
    quantity: "",
    amount: "50.000",
    notes: "",
    ...extra,
  });

  it("valida el importe que exige el tipo y nace pendiente", async () => {
    const missing = await errorOf(novelties.createNovelty(rrhh, refs.employee, manual({ amount: "" })));
    expect((missing as ValidationError).fieldErrors.amount?.[0]).toMatch(/requiere el importe/);
    const before = await errorOf(novelties.createNovelty(rrhh, refs.employee, manual({ date: "2023-01-01" })));
    expect((before as ValidationError).fieldErrors.date).toBeDefined();
    const { id } = await novelties.createNovelty(rrhh, refs.employee, manual());
    const row = await db.novelty.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ status: "PENDIENTE", sourceType: null });
    expect(row.amount?.toString()).toBe("50000");
  });

  it("aprobar, modificar (vuelve a pendiente), informar, desmarcar y anular", async () => {
    const { id } = await novelties.createNovelty(rrhh, refs.employee, manual({ amount: "10.000" }));
    expect(await novelties.approveNovelty(rrhh, id)).toEqual({ status: "Aprobada" });
    const item = (await novelties.listEmployeeNovelties(rrhh, refs.employee, {})).items.find((i) => i.id === id)!;
    expect(
      await novelties.updateNovelty(rrhh, id, { ...item.formValues, amount: "12.000", version: item.version }),
    ).toEqual({
      status: "Pendiente",
    });
    await expect(novelties.reportNovelty(administracion, id)).rejects.toBeInstanceOf(ConflictError);
    await novelties.approveNovelty(rrhh, id);
    await expect(novelties.approveNovelty(administracion, id)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await novelties.reportNovelty(administracion, id)).toEqual({ status: "Informada" });
    await expect(novelties.annulNovelty(rrhh, id, { reason: "Error de carga" })).rejects.toThrow(/desmarcala/);
    await novelties.unreportNovelty(administracion, id);
    await novelties.annulNovelty(rrhh, id, { reason: "Error de carga" });
    const row = await db.novelty.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("ANULADA");
    expect(row.notes).toBe("Anulada: Error de carga");
    expect(await lastAudit({ entityId: id })).toMatchObject({
      action: "UPDATE",
      after: { status: "ANULADA", reason: "Error de carga" },
    });
  });

  it("aprueba e informa en lote solo lo del filtro", async () => {
    const a = await novelties.createNovelty(rrhh, refs.other, manual({ noveltyTypeId: refs.freeType, amount: "" }));
    const b = await novelties.createNovelty(rrhh, refs.other, manual({ noveltyTypeId: refs.freeType, amount: "" }));
    const filter = { periodo: PERIOD, tipo: refs.freeType, estado: "vigentes" };
    expect(await novelties.bulkUpdate(rrhh, { ...filter, action: "aprobar" })).toEqual({ changed: 2 });
    await expect(novelties.bulkUpdate(rrhh, { ...filter, action: "aprobar", estado: "pendientes" })).resolves.toEqual({
      changed: 0,
    });
    await expect(novelties.bulkUpdate(consulta, { ...filter, action: "informar" })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(await novelties.bulkUpdate(administracion, { ...filter, action: "informar" })).toEqual({ changed: 2 });
    const rows = await db.novelty.findMany({ where: { id: { in: [a.id, b.id] } } });
    expect(rows.every((r) => r.status === "INFORMADA")).toBe(true);
    const list = await novelties.listNovelties(rrhh, { periodo: PERIOD, tipo: refs.freeType });
    expect(list.summary).toMatchObject({ reported: 2, pending: 0 });
  });
});

describe("generación de novedades", () => {
  const generated = (sourceType: string, employeeId = refs.employee) =>
    db.novelty.findMany({ where: { employeeId, sourceType, period: new Date(`${PERIOD}-01`) } });

  beforeAll(async () => {
    const day = (date: string, checkIn = "", checkOut = "") => ({
      date,
      checkIn,
      checkOut,
      breakMinutes: "",
      notes: "",
    });
    await attendance.saveDay(rrhh, refs.employee, day("2025-06-02", "09:00", "19:30")); // 90 min adicionales
    await attendance.saveDay(rrhh, refs.employee, day("2025-06-03", "09:20", "18:00")); // 20 min tarde
    await attendance.saveDay(rrhh, refs.employee, day("2025-06-04")); // ausente
    await db.leaveRecord.create({
      data: {
        employeeId: refs.employee,
        leaveTypeId: refs.absenceLeaveType,
        startDate: new Date("2025-05-29"),
        endDate: new Date("2025-06-01"),
        days: 4,
        status: "APROBADA",
        requestedById: rrhh.userId,
      },
    });
    await db.employeeChangeHistory.create({
      data: {
        employeeId: refs.employee,
        changeSetId: randomUUID(),
        changeType: "CATEGORIA",
        field: "categoryId",
        oldValue: "Administrativo A",
        newValue: "Administrativo B",
        effectiveDate: new Date("2025-06-20"),
        createdById: rrhh.userId,
      },
    });
  });

  it("muestra qué va a crear sin guardar nada", async () => {
    const preview = await novelties.previewGeneration(rrhh, { period: PERIOD });
    const ours = preview.create.filter(mine);
    expect(ours.map((n) => n.key.split("|")[0]).sort()).toEqual([
      "ATTENDANCE_ABSENCE",
      "ATTENDANCE_EXTRA",
      "ATTENDANCE_LATE",
      "CATEGORY_CHANGE",
      "LEAVE",
      "SALARY_HISTORY",
    ]);
    expect(await generated("ATTENDANCE_EXTRA")).toHaveLength(0);
    await expect(novelties.previewGeneration(administracion, { period: PERIOD })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(novelties.previewGeneration(rrhh, { period: "2999-01" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("genera con cantidades, importes y observaciones del origen", async () => {
    await novelties.generateNovelties(rrhh, { period: PERIOD });
    const [extra] = await generated("ATTENDANCE_EXTRA");
    expect(extra).toMatchObject({ noveltyTypeId: origin.HORAS_EXTRAS, status: "PENDIENTE", sourceId: refs.employee });
    expect(extra?.quantity?.toString()).toBe("1.5");
    const [late] = await generated("ATTENDANCE_LATE");
    expect(late?.quantity?.toString()).toBe("1");
    expect(late?.notes).toMatch(/20 min en total/);
    const [absent] = await generated("ATTENDANCE_ABSENCE");
    expect(absent?.notes).toBe("Ausente sin licencia: 04/06.");
    const [leave] = await generated("LEAVE");
    // Del 29/5 al 1/6 en días corridos: solo el 1/6 cae en junio.
    expect(leave).toMatchObject({ noveltyTypeId: refs.absenceNovelty, date: new Date("2025-06-01") });
    expect(leave?.quantity?.toString()).toBe("1");
    const [salary] = await generated("SALARY_HISTORY");
    expect(salary?.amount?.toString()).toBe("975000");
    const [category] = await generated("CATEGORY_CHANGE");
    expect(category?.notes).toMatch(/Administrativo A → Administrativo B/);
  });

  it("volver a generar no duplica; lo que cambia se recalcula y vuelve a pendiente", async () => {
    const again = await novelties.previewGeneration(rrhh, { period: PERIOD });
    expect([...again.create, ...again.update, ...again.annul].filter(mine)).toEqual([]);

    const [extra] = await generated("ATTENDANCE_EXTRA");
    await novelties.approveNovelty(rrhh, extra!.id);
    await attendance.saveDay(rrhh, refs.employee, {
      date: "2025-06-05",
      checkIn: "09:00",
      checkOut: "18:30",
      breakMinutes: "",
      notes: "",
    });
    const result = await novelties.generateNovelties(rrhh, { period: PERIOD });
    expect(result.updated).toBeGreaterThanOrEqual(1);
    const [recalculated] = await generated("ATTENDANCE_EXTRA");
    expect(recalculated).toMatchObject({ id: extra!.id, status: "PENDIENTE" });
    expect(recalculated?.quantity?.toString()).toBe("2");
  });

  it("las informadas no se tocan, las anuladas a mano no vuelven y sin origen se anulan", async () => {
    const [late] = await generated("ATTENDANCE_LATE");
    await novelties.approveNovelty(rrhh, late!.id);
    await novelties.reportNovelty(rrhh, late!.id);
    await attendance.saveDay(rrhh, refs.employee, {
      date: "2025-06-06",
      checkIn: "09:30",
      checkOut: "18:00",
      breakMinutes: "",
      notes: "",
    });
    const [category] = await generated("CATEGORY_CHANGE");
    await novelties.annulNovelty(rrhh, category!.id, { reason: "Se informa por otra vía" });
    await db.leaveRecord.updateMany({
      where: { employeeId: refs.employee, leaveTypeId: refs.absenceLeaveType },
      data: { status: "ANULADA" },
    });

    const preview = await novelties.previewGeneration(rrhh, { period: PERIOD });
    expect(preview.informedChanged.filter(mine).map((n) => n.key.split("|")[0])).toEqual(["ATTENDANCE_LATE"]);
    expect(preview.annul.filter(mine).map((n) => n.key.split("|")[0])).toEqual(["LEAVE"]);
    expect(preview.create.filter(mine)).toEqual([]);

    await novelties.generateNovelties(rrhh, { period: PERIOD });
    expect((await generated("ATTENDANCE_LATE"))[0]).toMatchObject({ status: "INFORMADA" });
    expect((await generated("ATTENDANCE_LATE"))[0]?.quantity?.toString()).toBe("1");
    expect((await generated("CATEGORY_CHANGE"))[0]?.status).toBe("ANULADA");
    const [leave] = await generated("LEAVE");
    expect(leave?.status).toBe("ANULADA");
    expect(leave?.notes).toMatch(/ya no corresponde/);
  });

  it("sin permiso de información salarial no se ve el importe del cambio de básico", async () => {
    const list = await novelties.listEmployeeNovelties(onlyNovelties, refs.employee, { origen: "generadas" });
    const salary = list.items.find((i) => i.type.id === origin.CAMBIO_SALARIAL);
    expect(salary).toMatchObject({ amount: null, notes: "Dato salarial reservado." });
    const full = await novelties.listEmployeeNovelties(rrhh, refs.employee, { origen: "generadas" });
    expect(full.items.find((i) => i.type.id === origin.CAMBIO_SALARIAL)?.amount).toBe("975000.00");
  });

  it("las generadas no se modifican a mano", async () => {
    const [extra] = await generated("ATTENDANCE_EXTRA");
    const error = await errorOf(
      novelties.updateNovelty(rrhh, extra!.id, {
        noveltyTypeId: extra!.noveltyTypeId,
        date: "2025-06-05",
        period: PERIOD,
        quantity: "5",
        amount: "",
        notes: "",
      }),
    );
    expect(error).toBeInstanceOf(ConflictError);
  });
});

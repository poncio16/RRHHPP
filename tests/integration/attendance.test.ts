import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as attendance from "@/features/attendance/service";
import { RESERVED_TYPE_LABEL } from "@/features/leaves/constants";
import * as leaves from "@/features/leaves/service";
import type { ActorContext } from "@/server/context";
import { db } from "@/server/db";
import { ConflictError, ForbiddenError, toAppError, ValidationError } from "@/server/errors";
import { actorFor, createTestUser, lastAudit } from "./helpers";

let rrhh: ActorContext;
let administracion: ActorContext;
let consulta: ActorContext;
const tag = Date.now().toString(36);
const refs = {} as Record<"employee" | "other" | "late" | "study" | "sick" | "department", string>;

// Semana pasada fija: el lunes 3 de marzo de 2025; el miércoles 5 se carga como feriado.
const MONDAY = "2025-03-03";
const HOLIDAY = "2025-03-05";
const SATURDAY = "2025-03-08";

async function appErrorOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return toAppError(error);
  }
  throw new Error("Se esperaba un error");
}

const day = (date: string, checkIn = "", checkOut = "", extra: Record<string, unknown> = {}) => ({
  date,
  checkIn,
  checkOut,
  breakMinutes: "",
  notes: "",
  ...extra,
});

async function stored(employeeId: string, date: string) {
  return db.attendanceDay.findUniqueOrThrow({ where: { employeeId_date: { employeeId, date: new Date(date) } } });
}

async function createEmployee(name: string, scheduleId: string | null) {
  const province = await db.province.upsert({
    where: { code: "AR-X" },
    update: {},
    create: { code: "AR-X", name: "Santa Cruz" },
  });
  return db.employee.create({
    data: {
      fileNumber: 700_000 + Math.floor(Math.random() * 90_000),
      lastName: "Asistencia",
      firstName: `${name} ${tag}`,
      dni: String(10_000_000 + Math.floor(Math.random() * 9_000_000)),
      cuil: `20${Math.floor(Math.random() * 1e9)}`.padEnd(11, "0").slice(0, 11),
      birthDate: new Date("1990-01-01"),
      sex: "M",
      addressLine: "Calle 1",
      city: "Ciudad",
      provinceId: province.id,
      postalCode: "9400",
      hireDate: new Date("2024-01-01"),
      seniorityDate: new Date("2024-01-01"),
      workScheduleId: scheduleId,
      departmentId: refs.department,
      positionId: (await db.position.create({ data: { name: `Asis puesto ${name} ${tag}` } })).id,
      contractTypeId: (await db.contractType.create({ data: { name: `Asis contrato ${name} ${tag}` } })).id,
      workplaceId: (await db.workplace.create({ data: { name: `Asis lugar ${name} ${tag}` } })).id,
    },
  });
}

beforeAll(async () => {
  rrhh = await actorFor((await createTestUser("RRHH")).id);
  administracion = await actorFor((await createTestUser("ADMINISTRACION")).id);
  consulta = await actorFor((await createTestUser("CONSULTA")).id);
  refs.department = (await db.department.create({ data: { name: `Asis sector ${tag}` } })).id;

  // Lunes a viernes de 09:00 a 18:00 con una hora de descanso.
  const schedule = await db.workSchedule.create({
    data: {
      name: `Asis horario ${tag}`,
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
  refs.employee = (await createEmployee("Ana", schedule.id)).id;
  refs.other = (await createEmployee("Beto", schedule.id)).id;
  refs.late = (await createEmployee("Carla", schedule.id)).id;
  await db.holiday.upsert({
    where: { date: new Date(HOLIDAY) },
    update: { isNonWorkingOptional: false },
    create: { date: new Date(HOLIDAY), name: "Carnaval de prueba" },
  });
  refs.study = (
    await db.leaveType.create({ data: { name: `Estudio ${tag}`, class: "LICENCIA", countingMode: "CORRIDOS" } })
  ).id;
  refs.sick = (
    await db.leaveType.create({
      data: { name: `Enfermedad ${tag}`, class: "LICENCIA", countingMode: "CORRIDOS", isSensitive: true },
    })
  ).id;
});

afterAll(async () => {
  await db.$disconnect();
});

describe("carga de un día", () => {
  it("calcula horas, guarda los minutos y audita", async () => {
    const result = await attendance.saveDay(rrhh, refs.employee, day(MONDAY, "09:10", "19:00"));
    expect(result.status).toBe("Presente");
    const row = await stored(refs.employee, MONDAY);
    expect(row).toMatchObject({
      status: "PRESENTE",
      breakMinutes: 60,
      workedMinutes: 530,
      regularMinutes: 480,
      extraMinutes: 50,
      lateMinutes: 10,
      source: "MANUAL",
    });
    expect(row.checkIn?.toISOString()).toBe("2025-03-03T12:10:00.000Z");
    expect(await lastAudit({ entityId: row.id })).toMatchObject({ action: "CREATE", module: "asistencia" });
  });

  it("sin horas: ausente en día hábil, feriado o franco según el día", async () => {
    await attendance.saveDay(rrhh, refs.employee, day("2025-03-04"));
    await attendance.saveDay(rrhh, refs.employee, day(HOLIDAY));
    await attendance.saveDay(rrhh, refs.employee, day(SATURDAY));
    expect((await stored(refs.employee, "2025-03-04")).status).toBe("AUSENTE");
    expect((await stored(refs.employee, HOLIDAY)).status).toBe("FERIADO");
    expect((await stored(refs.employee, SATURDAY)).status).toBe("FRANCO");
  });

  it("un feriado trabajado es todo adicional", async () => {
    await attendance.saveDay(rrhh, refs.other, day(HOLIDAY, "09:00", "13:00", { breakMinutes: "0" }));
    expect(await stored(refs.other, HOLIDAY)).toMatchObject({
      status: "PRESENTE",
      workedMinutes: 240,
      regularMinutes: 0,
      extraMinutes: 240,
    });
  });

  it("un día ya cargado se corrige solo con su versión", async () => {
    const error = await appErrorOf(attendance.saveDay(rrhh, refs.employee, day(MONDAY, "09:00", "18:00")));
    expect(error).toBeInstanceOf(ConflictError);
    const row = await stored(refs.employee, MONDAY);
    const stale = new Date(row.updatedAt.getTime() - 1000).toISOString();
    expect(
      await appErrorOf(attendance.saveDay(rrhh, refs.employee, { ...day(MONDAY, "09:00", "18:00"), version: stale })),
    ).toBeInstanceOf(ConflictError);
    await attendance.saveDay(rrhh, refs.employee, {
      ...day(MONDAY, "09:00", "18:00", { notes: "Corregido" }),
      version: row.updatedAt.toISOString(),
    });
    expect(await stored(refs.employee, MONDAY)).toMatchObject({ lateMinutes: 0, extraMinutes: 0, notes: "Corregido" });
    expect(await lastAudit({ entityId: row.id })).toMatchObject({ action: "UPDATE" });
  });

  it("no acepta días futuros ni anteriores al ingreso", async () => {
    const future = await appErrorOf(attendance.saveDay(rrhh, refs.employee, day("2099-01-05", "09:00", "18:00")));
    expect(future).toBeInstanceOf(ValidationError);
    expect((future as ValidationError).fieldErrors.date?.[0]).toMatch(/futuros/);
    const before = await appErrorOf(attendance.saveDay(rrhh, refs.employee, day("2023-12-29", "09:00", "18:00")));
    expect((before as ValidationError).fieldErrors.date?.[0]).toMatch(/relación laboral/);
  });

  it("el descanso del horario tiene que entrar en lo fichado", async () => {
    const error = await appErrorOf(attendance.saveDay(rrhh, refs.other, day("2025-03-06", "09:00", "09:45")));
    expect((error as ValidationError).fieldErrors.breakMinutes?.[0]).toMatch(/descanso del horario/);
  });

  it("la tolerancia de llegada tarde es un parámetro", async () => {
    await db.setting.upsert({
      where: { key: "attendance" },
      update: { value: { lateToleranceMinutes: 10, extraMinimumMinutes: 30 } },
      create: { key: "attendance", value: { lateToleranceMinutes: 10, extraMinimumMinutes: 30 } },
    });
    try {
      await attendance.saveDay(rrhh, refs.late, day("2025-03-06", "09:08", "18:20"));
      expect(await stored(refs.late, "2025-03-06")).toMatchObject({ lateMinutes: 0, extraMinutes: 0 });
      await attendance.saveDay(rrhh, refs.late, day("2025-03-07", "09:11", "18:45"));
      expect(await stored(refs.late, "2025-03-07")).toMatchObject({ lateMinutes: 11, extraMinutes: 34 });
    } finally {
      await db.setting.delete({ where: { key: "attendance" } });
    }
  });
});

describe("licencias", () => {
  it("un día con licencia aprobada queda con licencia y no admite fichada", async () => {
    await leaves.createLeave(rrhh, refs.other, {
      leaveTypeId: refs.study,
      startDate: "2025-03-10",
      endDate: "2025-03-11",
      notes: "",
      approve: true,
    });
    const error = await appErrorOf(attendance.saveDay(rrhh, refs.other, day("2025-03-10", "09:00", "18:00")));
    expect((error as ValidationError).fieldErrors.checkIn?.[0]).toMatch(/cubierto por estudio/);
    await attendance.saveDay(rrhh, refs.other, day("2025-03-10"));
    const row = await stored(refs.other, "2025-03-10");
    expect(row.status).toBe("JUSTIFICADO");
    expect(row.leaveRecordId).not.toBeNull();
  });

  it("aprobar una licencia sobre días con fichada se bloquea", async () => {
    await attendance.saveDay(rrhh, refs.other, day("2025-03-12", "09:00", "18:00"));
    const request = await leaves.createLeave(rrhh, refs.other, {
      leaveTypeId: refs.study,
      startDate: "2025-03-12",
      endDate: "2025-03-12",
      notes: "",
    });
    const version = (await db.leaveRecord.findUniqueOrThrow({ where: { id: request.id } })).updatedAt.toISOString();
    const error = await appErrorOf(leaves.decideLeave(rrhh, request.id, { version, decision: "APROBADA" }));
    expect(error).toBeInstanceOf(ConflictError);
    expect(error?.message).toMatch(/12\/03\/2025/);
  });

  it("aprobar y anular una licencia actualiza los días ya cargados sin fichada", async () => {
    await attendance.saveDay(rrhh, refs.other, day("2025-03-13"));
    expect((await stored(refs.other, "2025-03-13")).status).toBe("AUSENTE");
    const request = await leaves.createLeave(rrhh, refs.other, {
      leaveTypeId: refs.sick,
      startDate: "2025-03-13",
      endDate: "2025-03-14",
      notes: "",
    });
    const read = async () =>
      (await db.leaveRecord.findUniqueOrThrow({ where: { id: request.id } })).updatedAt.toISOString();
    await leaves.decideLeave(rrhh, request.id, { version: await read(), decision: "APROBADA" });
    expect(await stored(refs.other, "2025-03-13")).toMatchObject({ status: "JUSTIFICADO", leaveRecordId: request.id });

    // Sin permiso de datos de salud, el tipo de licencia no se muestra.
    const visible = await attendance.listDays(
      rrhh,
      { desde: "2025-03-13", hasta: "2025-03-13" },
      { employeeId: refs.other },
    );
    expect(visible.items[0]?.leave).toBe(`Enfermedad ${tag}`);
    const reserved = await attendance.listDays(
      administracion,
      { desde: "2025-03-13", hasta: "2025-03-13" },
      { employeeId: refs.other },
    );
    expect(reserved.items[0]?.leave).toBe(RESERVED_TYPE_LABEL);

    await leaves.annulLeave(rrhh, request.id, { version: await read(), reason: "Cargada por error" });
    expect(await stored(refs.other, "2025-03-13")).toMatchObject({ status: "AUSENTE", leaveRecordId: null });
  });
});

describe("planilla diaria", () => {
  it("muestra a cada empleado con lo esperado ese día", async () => {
    const sheet = await attendance.getSheet(rrhh, { fecha: "2025-03-10", sector: refs.department });
    const names = sheet.rows.map((r) => r.employee.name);
    expect(names).toEqual([`Asistencia, Ana ${tag}`, `Asistencia, Beto ${tag}`, `Asistencia, Carla ${tag}`]);
    expect(sheet.rows[0]).toMatchObject({ plan: "09:00–18:00", workday: true, defaultBreak: 60, leave: null });
    expect(sheet.rows[1]?.leave).toBe(`Estudio ${tag}`);
    expect((await attendance.getSheet(rrhh, { fecha: "2099-01-01" })).isToday).toBe(true);
  });

  it("si una fila tiene problemas no se guarda ninguna", async () => {
    const error = await appErrorOf(
      attendance.saveSheet(rrhh, {
        date: "2025-03-17",
        rows: [
          { employeeId: refs.employee, version: null, checkIn: "09:00", checkOut: "18:00" },
          { employeeId: refs.other, version: null, checkIn: "", checkOut: "", breakMinutes: "", notes: "" },
          { employeeId: refs.late, version: null, checkIn: "09:00", checkOut: "09:30" },
        ],
      }),
    );
    expect(error).toBeInstanceOf(ValidationError);
    expect(Object.keys((error as ValidationError).fieldErrors)).toEqual(["rows.2.breakMinutes"]);
    expect(
      await db.attendanceDay.count({
        where: { date: new Date("2025-03-17"), employee: { departmentId: refs.department } },
      }),
    ).toBe(0);

    const result = await attendance.saveSheet(rrhh, {
      date: "2025-03-17",
      rows: [
        { employeeId: refs.employee, version: null, checkIn: "09:00", checkOut: "18:00" },
        { employeeId: refs.other, version: null, checkIn: "", checkOut: "", breakMinutes: "", notes: "Sin aviso" },
        { employeeId: refs.late, version: null, checkIn: "09:20", checkOut: "18:00", breakMinutes: "30" },
      ],
    });
    expect(result.saved).toBe(3);
    expect((await stored(refs.other, "2025-03-17")).status).toBe("AUSENTE");
    expect(await stored(refs.late, "2025-03-17")).toMatchObject({ lateMinutes: 20, workedMinutes: 490 });
  });
});

describe("consulta y permisos", () => {
  it("lista con filtros y totales", async () => {
    const late = await attendance.listDays(rrhh, { estado: "tarde", sector: refs.department, hasta: "2025-03-31" });
    expect(late.items.every((i) => i.lateMinutes > 0)).toBe(true);
    expect(late.summary.lateDays).toBe(late.total);
    const all = await attendance.listDays(rrhh, { sector: refs.department, desde: MONDAY, hasta: "2025-03-31" });
    expect(all.summary.absent).toBeGreaterThanOrEqual(2);
    expect(all.summary.workedMinutes).toBe(all.items.reduce((sum, i) => sum + i.workedMinutes, 0));
    const month = await attendance.getEmployeeMonth(rrhh, refs.employee, { mes: "2025-03" });
    expect(month.label).toBe("marzo de 2025");
    expect(month.items.map((i) => i.formValues.date)).toContain(MONDAY);
  });

  it("Consulta y Administración solo leen", async () => {
    expect((await attendance.listDays(consulta, {})).total).toBeGreaterThan(0);
    for (const ctx of [consulta, administracion]) {
      expect(
        await appErrorOf(attendance.saveDay(ctx, refs.employee, day("2025-03-18", "09:00", "18:00"))),
      ).toBeInstanceOf(ForbiddenError);
    }
  });
});

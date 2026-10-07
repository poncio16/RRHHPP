import { describe, expect, it } from "vitest";
import {
  attendanceMinutes,
  attendanceStatus,
  dayPlan,
  formatMinutes,
  shiftInstants,
  type AttendanceParams,
  type ScheduleSlot,
} from "@/features/attendance/calc";
import { attendanceDaySchema, attendanceSheetSchema } from "@/features/attendance/schemas";
import { defaultWorkDays } from "@/features/leaves/days";
import { formatTime, zonedInstant } from "@/lib/format";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const MON_FRI = defaultWorkDays(5);
// Lunes a viernes de 09:00 a 18:00 con una hora de descanso: 8 horas.
const OFFICE: ScheduleSlot[] = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
  dayOfWeek,
  startTime: "09:00",
  endTime: "18:00",
  breakMinutes: 60,
}));
const MONDAY = d("2025-03-03");

describe("zona horaria", () => {
  it("una hora local de Buenos Aires es tres horas más en UTC", () => {
    expect(zonedInstant(MONDAY, 9 * 60).toISOString()).toBe("2025-03-03T12:00:00.000Z");
    expect(formatTime(new Date("2025-03-03T12:00:00Z"))).toBe("09:00");
  });

  it("una salida anterior a la entrada es del día siguiente", () => {
    const { checkIn, checkOut } = shiftInstants(MONDAY, "22:00", "06:00");
    expect(checkIn.toISOString()).toBe("2025-03-04T01:00:00.000Z");
    expect(checkOut.toISOString()).toBe("2025-03-04T09:00:00.000Z");
  });
});

describe("plan y estado del día", () => {
  it("feriado, día del horario, franco o día hábil sin horario", () => {
    expect(dayPlan(MONDAY, OFFICE, MON_FRI, { name: "Carnaval" })).toEqual({ kind: "feriado", name: "Carnaval" });
    expect(dayPlan(MONDAY, OFFICE, MON_FRI, null).kind).toBe("turno");
    expect(dayPlan(d("2025-03-08"), OFFICE, MON_FRI, null).kind).toBe("franco");
    expect(dayPlan(MONDAY, null, MON_FRI, null).kind).toBe("habil");
    expect(dayPlan(d("2025-03-08"), null, defaultWorkDays(6), null).kind).toBe("habil");
  });

  it("la licencia manda; después la fichada; sin fichada, ausente salvo franco o feriado", () => {
    const turno = dayPlan(MONDAY, OFFICE, MON_FRI, null);
    expect(attendanceStatus(turno, false, true)).toBe("JUSTIFICADO");
    expect(attendanceStatus(turno, true, false)).toBe("PRESENTE");
    expect(attendanceStatus(turno, false, false)).toBe("AUSENTE");
    expect(attendanceStatus({ kind: "franco" }, false, false)).toBe("FRANCO");
    expect(attendanceStatus({ kind: "feriado", name: "x" }, false, false)).toBe("FERIADO");
  });
});

describe("horas del día", () => {
  const params = (checkIn: string, checkOut: string, extra: Partial<AttendanceParams> = {}): AttendanceParams => ({
    date: MONDAY,
    ...shiftInstants(MONDAY, checkIn, checkOut),
    breakMinutes: 60,
    plan: dayPlan(MONDAY, OFFICE, MON_FRI, null),
    lateToleranceMinutes: 0,
    extraMinimumMinutes: 0,
    ...extra,
  });

  it("jornada completa a horario", () => {
    expect(attendanceMinutes(params("09:00", "18:00"))).toEqual({ worked: 480, regular: 480, extra: 0, late: 0 });
  });

  it("tarde: cuenta todos los minutos si supera la tolerancia", () => {
    expect(attendanceMinutes(params("09:12", "18:00")).late).toBe(12);
    expect(attendanceMinutes(params("09:12", "18:00", { lateToleranceMinutes: 15 })).late).toBe(0);
    expect(attendanceMinutes(params("09:16", "18:00", { lateToleranceMinutes: 15 })).late).toBe(16);
    expect(attendanceMinutes(params("08:45", "18:00")).late).toBe(0);
  });

  it("adicionales: lo que excede el horario, desde el mínimo configurado", () => {
    expect(attendanceMinutes(params("09:00", "19:30"))).toEqual({ worked: 570, regular: 480, extra: 90, late: 0 });
    expect(attendanceMinutes(params("09:00", "18:20", { extraMinimumMinutes: 30 }))).toEqual({
      worked: 500,
      regular: 480,
      extra: 0,
      late: 0,
    });
    expect(attendanceMinutes(params("09:00", "16:00")).regular).toBe(360);
  });

  it("turno nocturno que cruza la medianoche", () => {
    const night: ScheduleSlot[] = [{ dayOfWeek: 1, startTime: "22:00", endTime: "06:00", breakMinutes: 30 }];
    const plan = dayPlan(MONDAY, night, MON_FRI, null);
    const result = attendanceMinutes({ ...params("22:05", "06:30"), breakMinutes: 30, plan });
    expect(result).toEqual({ worked: 475, regular: 450, extra: 25, late: 5 });
  });

  it("franco o feriado trabajado es todo adicional; sin horario asignado, todo normal", () => {
    expect(attendanceMinutes(params("09:00", "13:00", { breakMinutes: 0, plan: { kind: "franco" } }))).toEqual({
      worked: 240,
      regular: 0,
      extra: 240,
      late: 0,
    });
    expect(attendanceMinutes(params("10:00", "19:00", { plan: { kind: "habil" } }))).toEqual({
      worked: 480,
      regular: 480,
      extra: 0,
      late: 0,
    });
  });

  it("formato de horas", () => {
    expect(formatMinutes(450)).toBe("7:30");
    expect(formatMinutes(5)).toBe("0:05");
    expect(formatMinutes(0)).toBe("0:00");
  });
});

describe("esquemas", () => {
  it("entrada y salida van juntas y el descanso entra en la jornada", () => {
    const base = { date: "2025-03-03", checkIn: "09:00", checkOut: "18:00", breakMinutes: "60", notes: " " };
    const once = attendanceDaySchema.parse(base);
    expect(once).toMatchObject({ breakMinutes: 60, notes: null });
    expect(attendanceDaySchema.parse(once)).toEqual(once);
    expect(attendanceDaySchema.parse({ ...base, checkIn: "", checkOut: "", breakMinutes: "" })).toMatchObject({
      checkIn: null,
      checkOut: null,
      breakMinutes: null,
    });
    expect(attendanceDaySchema.safeParse({ ...base, checkOut: "" }).error?.issues[0]?.path).toEqual(["checkOut"]);
    expect(attendanceDaySchema.safeParse({ ...base, checkIn: "9" }).error?.issues[0]?.path).toEqual(["checkIn"]);
    const longBreak = attendanceDaySchema.safeParse({ ...base, checkOut: "10:00", breakMinutes: "60" });
    expect(longBreak.error?.issues[0]?.path).toEqual(["breakMinutes"]);
  });

  it("la planilla marca la fila con problemas y no acepta empleados repetidos", () => {
    const row = { employeeId: "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b", version: null, checkIn: "09:00", checkOut: "" };
    const bad = attendanceSheetSchema.safeParse({ date: "2025-03-03", rows: [row] });
    expect(bad.error?.issues[0]?.path).toEqual(["rows", 0, "checkOut"]);
    const repeated = attendanceSheetSchema.safeParse({
      date: "2025-03-03",
      rows: [
        { ...row, checkOut: "18:00" },
        { ...row, checkOut: "18:00" },
      ],
    });
    expect(repeated.error?.issues[0]?.message).toMatch(/más de una vez/);
  });
});

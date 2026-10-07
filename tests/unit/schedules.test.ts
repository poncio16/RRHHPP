import { describe, expect, it } from "vitest";
import { crossesMidnight, summarizeDays, weeklyHours, workedMinutes } from "@/features/schedules/calc";
import { scheduleSchema } from "@/features/schedules/schemas";

const day = (dayOfWeek: number, startTime = "09:00", endTime = "18:00", breakMinutes = 60) => ({
  dayOfWeek,
  startTime,
  endTime,
  breakMinutes,
});

describe("cálculo de horarios", () => {
  it("descuenta el descanso", () => {
    expect(workedMinutes("09:00", "18:00", 60)).toBe(480);
  });

  it("un turno nocturno cruza la medianoche", () => {
    expect(crossesMidnight("22:00", "06:00")).toBe(true);
    expect(workedMinutes("22:00", "06:00", 0)).toBe(480);
    expect(crossesMidnight("09:00", "18:00")).toBe(false);
  });

  it("suma las horas semanales con dos decimales", () => {
    expect(weeklyHours([1, 2, 3, 4, 5].map((d) => day(d)))).toBe("40.00");
    expect(weeklyHours([day(1, "08:00", "12:20", 0)])).toBe("4.33");
  });

  it("resume días consecutivos con el mismo horario", () => {
    const days = [...[1, 2, 3, 4, 5].map((d) => day(d)), day(6, "09:00", "13:00")];
    expect(summarizeDays(days)).toBe("Lun a Vie 09:00–18:00 · Sáb 09:00–13:00");
    expect(summarizeDays([day(1), day(2)])).toBe("Lun y Mar 09:00–18:00");
  });
});

describe("validación de horarios", () => {
  const week = (
    overrides: Partial<{ enabled: boolean; startTime: string; endTime: string; breakMinutes: number }> = {},
  ) =>
    Array.from({ length: 7 }, (_, i) => ({
      dayOfWeek: i + 1,
      enabled: i === 0,
      startTime: "09:00",
      endTime: "18:00",
      breakMinutes: 60,
      ...(i === 0 ? overrides : {}),
    }));

  it("exige al menos un día", () => {
    const result = scheduleSchema.safeParse({ name: "X", days: week({ enabled: false }) });
    expect(result.success).toBe(false);
  });

  it("rechaza un descanso que cubre toda la jornada", () => {
    const result = scheduleSchema.safeParse({ name: "X", days: week({ breakMinutes: 540 }) });
    expect(result.error?.issues[0]?.path).toEqual(["days", 0, "breakMinutes"]);
  });

  it("rechaza entrada y salida iguales", () => {
    const result = scheduleSchema.safeParse({ name: "X", days: week({ endTime: "09:00" }) });
    expect(result.error?.issues[0]?.path).toEqual(["days", 0, "endTime"]);
  });

  it("ignora las horas de los días que no se trabajan", () => {
    const days = week();
    days[3] = { ...days[3]!, startTime: "", endTime: "" };
    expect(scheduleSchema.safeParse({ name: "X", days }).success).toBe(true);
  });
});

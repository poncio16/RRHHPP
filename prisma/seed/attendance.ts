import type { PrismaClient } from "../../src/generated/prisma/client";
import { attendanceMinutes, attendanceStatus, dayPlan, shiftInstants } from "../../src/features/attendance/calc";
import { defaultWorkDays } from "../../src/features/leaves/days";
import { parseTime } from "../../src/features/schedules/calc";
import { defaultSetting } from "../../src/server/settings/definitions";

/**
 * Asistencia ficticia de las dos semanas anteriores a hoy para el personal
 * activo, calculada con su horario y los parámetros por defecto: algunas
 * llegadas tarde, horas adicionales y ausencias. Los francos y feriados no
 * se cargan; los días con licencia aprobada quedan "con licencia".
 * Se carga una sola vez (sus fechas son relativas a hoy).
 */
const DAYS_BACK = 14;
const DAY = 86_400_000;

const hhmm = (minutes: number) => {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

export async function seedAttendance(db: PrismaClient): Promise<number> {
  if ((await db.attendanceDay.count()) > 0) return 0;
  const admin = await db.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!admin) return 0;

  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const start = new Date(today - DAYS_BACK * DAY);
  const end = new Date(today - DAY);
  const settings = defaultSetting("attendance");
  const workDays = defaultWorkDays(defaultSetting("leaves").defaultWorkDays);
  const [employees, holidayRows, leaves] = await Promise.all([
    db.employee.findMany({
      where: { status: "ACTIVO", hireDate: { lte: start } },
      select: {
        id: true,
        fileNumber: true,
        workSchedule: {
          select: { days: { select: { dayOfWeek: true, startTime: true, endTime: true, breakMinutes: true } } },
        },
      },
    }),
    db.holiday.findMany({ where: { date: { gte: start, lte: end }, isNonWorkingOptional: false } }),
    db.leaveRecord.findMany({
      where: { status: "APROBADA", startDate: { lte: end }, endDate: { gte: start } },
      select: { id: true, employeeId: true, startDate: true, endDate: true },
    }),
  ]);
  const holidays = new Map(holidayRows.map((h) => [h.date.toISOString().slice(0, 10), { name: h.name }]));

  const data = [];
  for (const employee of employees) {
    for (let i = 0; i <= DAYS_BACK - 1; i++) {
      const date = new Date(start.getTime() + i * DAY);
      const plan = dayPlan(
        date,
        employee.workSchedule?.days ?? null,
        workDays,
        holidays.get(date.toISOString().slice(0, 10)) ?? null,
      );
      const leave = leaves.find((l) => l.employeeId === employee.id && l.startDate <= date && l.endDate >= date);
      if (!leave && (plan.kind === "franco" || plan.kind === "feriado")) continue;
      // Variación determinística por empleado y día.
      const h = (employee.fileNumber * 31 + i * 17) % 100;
      const absent = !leave && h < 4;
      const base = {
        employeeId: employee.id,
        date,
        leaveRecordId: leave?.id ?? null,
        createdById: admin.id,
        updatedById: admin.id,
      };
      if (leave || absent) {
        data.push({
          ...base,
          status: attendanceStatus(plan, false, !!leave),
          notes: absent ? "Sin aviso (dato ficticio)." : null,
        });
        continue;
      }
      const slot = plan.kind === "turno" ? plan.slot : { startTime: "09:00", endTime: "17:00", breakMinutes: 30 };
      const late = h % 10 === 0 ? 18 : (h % 13) - 4;
      const checkIn = hhmm(parseTime(slot.startTime)! + late);
      const checkOut = hhmm(parseTime(slot.endTime)! + ((h * 7) % 40) - 5);
      const instants = shiftInstants(date, checkIn, checkOut);
      const minutes = attendanceMinutes({ date, ...instants, breakMinutes: slot.breakMinutes, plan, ...settings });
      data.push({
        ...base,
        ...instants,
        status: "PRESENTE" as const,
        breakMinutes: slot.breakMinutes,
        workedMinutes: minutes.worked,
        regularMinutes: minutes.regular,
        extraMinutes: minutes.extra,
        lateMinutes: minutes.late,
        notes: late === 18 ? "Demora en el transporte (dato ficticio)." : null,
      });
    }
  }
  const { count } = await db.attendanceDay.createMany({ data });
  return count;
}

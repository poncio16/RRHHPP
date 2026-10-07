import "server-only";
import * as catalogs from "@/features/catalogs/repository";
import { auditDiff, recordAudit, sanitizeForAudit } from "@/server/audit";
import { assertPermission } from "@/server/authz";
import type { ActorContext } from "@/server/context";
import { NotFoundError } from "@/server/errors";
import { z } from "@/lib/zod";
import { crossesMidnight, summarizeDays, weeklyHours } from "./calc";
import * as repo from "./repository";
import { scheduleSchema } from "./schemas";

const MODULE = "configuracion";
const PERMISSION = "config:catalogs";

const statusSchema = z.enum(["activos", "inactivos", "todos"]).catch("activos");

/** Lo que se compara en la auditoría: datos generales y un resumen de los días. */
const auditable = (s: repo.ScheduleRecord) => ({
  name: s.name,
  workModalityId: s.workModalityId,
  weeklyHours: s.weeklyHours,
  days: s.days.map((d) => `${d.dayOfWeek} ${d.startTime}-${d.endTime} (${d.breakMinutes} min)`).join(", "),
  isActive: s.isActive,
});

export async function listSchedules(ctx: ActorContext, rawStatus: unknown) {
  await assertPermission(ctx, PERMISSION, MODULE);
  const status = statusSchema.parse(rawStatus);
  const schedules = await repo.listSchedules(status);
  return {
    status,
    items: schedules.map((s) => ({
      id: s.id,
      name: s.name,
      isActive: s.isActive,
      weeklyHours: s.weeklyHours.toString(),
      modality: s.workModality?.label ?? null,
      summary: summarizeDays(s.days),
      formValues: {
        name: s.name,
        workModalityId: s.workModalityId ?? "",
        days: Array.from({ length: 7 }, (_, i) => {
          const day = s.days.find((d) => d.dayOfWeek === i + 1);
          return {
            dayOfWeek: i + 1,
            enabled: !!day,
            startTime: day?.startTime ?? "",
            endTime: day?.endTime ?? "",
            breakMinutes: day?.breakMinutes ?? 0,
          };
        }),
      },
    })),
  };
}

export async function getModalityOptions(ctx: ActorContext, includeIds: string[] = []) {
  await assertPermission(ctx, PERMISSION, MODULE);
  return catalogs.listOptions("modalidades", includeIds);
}

function prepare(input: unknown) {
  const data = scheduleSchema.parse(input);
  const days = data.days
    .filter((d) => d.enabled)
    .map((d) => ({
      dayOfWeek: d.dayOfWeek,
      startTime: d.startTime,
      endTime: d.endTime,
      breakMinutes: d.breakMinutes,
      crossesMidnight: crossesMidnight(d.startTime, d.endTime),
    }));
  return { schedule: { name: data.name, workModalityId: data.workModalityId, weeklyHours: weeklyHours(days) }, days };
}

export async function createSchedule(ctx: ActorContext, input: unknown) {
  await assertPermission(ctx, PERMISSION, MODULE);
  const { schedule, days } = prepare(input);
  return repo.transaction(async (tx) => {
    const created = await repo.createSchedule(schedule, days, ctx.userId, tx);
    await recordAudit(
      ctx,
      {
        action: "CREATE",
        module: MODULE,
        entityType: "WorkSchedule",
        entityId: created.id,
        after: sanitizeForAudit(auditable(created)),
        message: `Alta de horario: ${created.name}`,
      },
      tx,
    );
    return { id: created.id };
  });
}

export async function updateSchedule(ctx: ActorContext, id: string, input: unknown) {
  await assertPermission(ctx, PERMISSION, MODULE);
  const { schedule, days } = prepare(input);
  await repo.transaction(async (tx) => {
    const current = await repo.findSchedule(id, tx);
    if (!current) throw new NotFoundError();
    const updated = await repo.updateSchedule(id, schedule, days, ctx.userId, tx);
    const diff = auditDiff(auditable(current), auditable(updated));
    if (!diff) return;
    await recordAudit(
      ctx,
      {
        action: "UPDATE",
        module: MODULE,
        entityType: "WorkSchedule",
        entityId: id,
        ...diff,
        message: `Modificación de horario: ${updated.name}`,
      },
      tx,
    );
  });
}

export async function setScheduleActive(ctx: ActorContext, id: string, isActive: boolean) {
  await assertPermission(ctx, PERMISSION, MODULE);
  await repo.transaction(async (tx) => {
    const current = await repo.findSchedule(id, tx);
    if (!current) throw new NotFoundError();
    if (current.isActive === isActive) return;
    await repo.setActive(id, isActive, ctx.userId, tx);
    await recordAudit(
      ctx,
      {
        action: "UPDATE",
        module: MODULE,
        entityType: "WorkSchedule",
        entityId: id,
        before: { isActive: current.isActive },
        after: { isActive },
        message: `${isActive ? "Reactivación" : "Desactivación"} de horario: ${current.name}`,
      },
      tx,
    );
  });
}

import "server-only";
import { parseIsoDate, todayInTimeZone } from "@/lib/format";
import { auditDiff, recordAudit, sanitizeForAudit } from "@/server/audit";
import { assertPermission } from "@/server/authz";
import type { ActorContext } from "@/server/context";
import { NotFoundError } from "@/server/errors";
import * as repo from "./repository";
import { holidayListQuerySchema, holidaySchema } from "./schemas";

const MODULE = "configuracion";
const PERMISSION = "config:catalogs";

const auditable = (h: { date: Date; name: string; isNonWorkingOptional: boolean }) => ({
  date: h.date,
  name: h.name,
  isNonWorkingOptional: h.isNonWorkingOptional,
});

function parse(input: unknown) {
  const data = holidaySchema.parse(input);
  return { ...data, date: parseIsoDate(data.date)! };
}

/** Feriados de un año (por defecto, el actual) y los años que tienen feriados cargados. */
export async function listHolidays(ctx: ActorContext, rawQuery: unknown) {
  await assertPermission(ctx, PERMISSION, MODULE);
  const currentYear = todayInTimeZone().getUTCFullYear();
  const year = holidayListQuerySchema.parse(rawQuery).year ?? currentYear;
  const [items, years] = await Promise.all([repo.listByYear(year), repo.listYears()]);
  const allYears = [...new Set([...years, currentYear, currentYear + 1, year])].sort((a, b) => a - b);
  return { year, years: allYears, items };
}

export async function createHoliday(ctx: ActorContext, input: unknown) {
  await assertPermission(ctx, PERMISSION, MODULE);
  const data = parse(input);
  return repo.transaction(async (tx) => {
    const created = await repo.create(data, tx);
    await recordAudit(
      ctx,
      {
        action: "CREATE",
        module: MODULE,
        entityType: "Holiday",
        entityId: created.id,
        after: sanitizeForAudit(auditable(created)),
        message: `Alta de feriado: ${created.name}`,
      },
      tx,
    );
    return { id: created.id };
  });
}

export async function updateHoliday(ctx: ActorContext, id: string, input: unknown) {
  await assertPermission(ctx, PERMISSION, MODULE);
  const data = parse(input);
  await repo.transaction(async (tx) => {
    const current = await repo.findById(id, tx);
    if (!current) throw new NotFoundError();
    const updated = await repo.update(id, data, tx);
    const diff = auditDiff(auditable(current), auditable(updated));
    if (!diff) return;
    await recordAudit(
      ctx,
      {
        action: "UPDATE",
        module: MODULE,
        entityType: "Holiday",
        entityId: id,
        ...diff,
        message: `Modificación de feriado: ${updated.name}`,
      },
      tx,
    );
  });
}

/**
 * Los feriados son configuración (no datos de personal), así que se pueden
 * borrar; queda el registro completo en la auditoría.
 */
export async function deleteHoliday(ctx: ActorContext, id: string) {
  await assertPermission(ctx, PERMISSION, MODULE);
  await repo.transaction(async (tx) => {
    const current = await repo.findById(id, tx);
    if (!current) throw new NotFoundError();
    await repo.remove(id, tx);
    await recordAudit(
      ctx,
      {
        action: "DELETE",
        module: MODULE,
        entityType: "Holiday",
        entityId: id,
        before: sanitizeForAudit(auditable(current)),
        message: `Baja de feriado: ${current.name}`,
      },
      tx,
    );
  });
}

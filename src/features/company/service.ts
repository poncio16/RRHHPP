import "server-only";
import { auditDiff, recordAudit, sanitizeForAudit } from "@/server/audit";
import { assertPermission } from "@/server/authz";
import type { ActorContext } from "@/server/context";
import * as catalogs from "@/features/catalogs/repository";
import * as repo from "./repository";
import { companySchema } from "./schemas";

const MODULE = "configuracion";

export async function getCompany(ctx: ActorContext) {
  await assertPermission(ctx, "config:manage", MODULE);
  return repo.findCompany();
}

/** Opciones de los selectores del formulario (incluye las ya asignadas aunque estén inactivas). */
export async function getCompanyFormOptions(ctx: ActorContext, assigned: (string | null)[]) {
  await assertPermission(ctx, "config:manage", MODULE);
  const ids = assigned.filter((id): id is string => !!id);
  const [provinces, artProviders, workplaces] = await Promise.all([
    catalogs.listProvinceOptions(),
    catalogs.listOptions("art", ids),
    catalogs.listOptions("establecimientos", ids),
  ]);
  return { provinces, artProviders, workplaces };
}

/** Crea los datos de la empresa la primera vez y después los actualiza. */
export async function saveCompany(ctx: ActorContext, input: unknown) {
  await assertPermission(ctx, "config:manage", MODULE);
  const data = companySchema.parse(input);

  await repo.transaction(async (tx) => {
    const current = await repo.findCompany(tx);
    if (!current) {
      const created = await repo.createCompany({ ...data, updatedById: ctx.userId }, tx);
      await recordAudit(
        ctx,
        {
          action: "CREATE",
          module: MODULE,
          entityType: "Company",
          entityId: created.id,
          after: sanitizeForAudit(created),
          message: "Alta de los datos de la empresa",
        },
        tx,
      );
      return;
    }
    const updated = await repo.updateCompany(current.id, { ...data, updatedById: ctx.userId }, tx);
    const diff = auditDiff(current, updated);
    if (!diff) return;
    await recordAudit(
      ctx,
      {
        action: "UPDATE",
        module: MODULE,
        entityType: "Company",
        entityId: current.id,
        ...diff,
        message: "Modificación de los datos de la empresa",
      },
      tx,
    );
  });
}

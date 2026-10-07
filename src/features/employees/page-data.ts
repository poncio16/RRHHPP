import "server-only";
import { notFound } from "next/navigation";
import { hasPermission } from "@/server/authz";
import { requirePageAccess } from "@/server/auth/request";
import { NotFoundError } from "@/server/errors";
import { z } from "@/lib/zod";
import { getPendingExit } from "@/features/exits/service";
import { getActiveSuspension } from "@/features/leaves/service";
import { getEmployee } from "./service";

/**
 * Acceso y legajo para las páginas de `/empleados/[id]`. Un id que no es UUID
 * o que no existe da 404.
 */
export async function loadEmployeePage(params: Promise<{ id: string }>) {
  const access = await requirePageAccess("employee:read", "empleados");
  if (!access.allowed) return { allowed: false as const };
  const parsed = z.uuid().safeParse((await params).id);
  if (!parsed.success) notFound();
  const employee = await getEmployee(access.ctx, parsed.data).catch((error: unknown) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const { ctx } = access;
  const canSeeExits = hasPermission(ctx, "exit:read");
  const active = employee.status === "ACTIVO";
  const [suspension, pendingExit] = await Promise.all([
    active ? getActiveSuspension(ctx, employee.id) : null,
    active && canSeeExits ? getPendingExit(ctx, employee.id) : null,
  ]);
  return {
    allowed: true as const,
    ctx,
    employee,
    suspension,
    pendingExit,
    canEdit: hasPermission(ctx, "employee:write") && hasPermission(ctx, "employee.personal:read"),
    canSeeBank: hasPermission(ctx, "employee.bank:read"),
    canSeeDocuments: hasPermission(ctx, "document:read"),
    canSeeLeaves: hasPermission(ctx, "leave:read"),
    canSeeAttendance: hasPermission(ctx, "attendance:read"),
    canSeeSalary: hasPermission(ctx, "salary:read"),
    canSeeNovelties: hasPermission(ctx, "novelty:read"),
    canSeeExits,
  };
}

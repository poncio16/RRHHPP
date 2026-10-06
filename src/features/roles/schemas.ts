import { isPermission } from "@/server/authz/permissions";
import { z } from "@/lib/zod";

export const updateRolePermissionsSchema = z.object({
  roleId: z.uuid(),
  permissions: z
    .array(z.string().refine(isPermission, { error: "Permiso desconocido." }))
    .transform((list) => [...new Set(list)].sort()),
});

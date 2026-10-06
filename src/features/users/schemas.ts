import { baseListQuerySchema } from "@/lib/list/query";
import { z } from "@/lib/zod";

const name = z
  .string()
  .trim()
  .min(2, { error: "Ingresá el nombre (al menos 2 caracteres)." })
  .max(120, { error: "El nombre es demasiado largo." });
const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Ingresá un email válido." }).max(200));
const roleId = z.uuid({ error: "Elegí un rol." });

export const createUserSchema = z.object({ name, email, roleId });
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({ name, email, roleId, isActive: z.boolean() });
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const userListQuerySchema = baseListQuerySchema.extend({
  roleId: z.uuid().optional().catch(undefined),
  status: z.enum(["activos", "inactivos", "todos"]).catch("activos").default("activos"),
});
export type UserListQuery = z.infer<typeof userListQuerySchema>;

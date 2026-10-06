import { z } from "@/lib/zod";

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: "Ingresá un email válido." })),
  password: z.string().min(1, { error: "Ingresá tu contraseña." }).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** La longitud mínima real viene del parámetro de seguridad; el esquema base controla el resto. */
export function newPasswordSchema(minLength: number) {
  return z
    .string()
    .min(minLength, { error: `La contraseña debe tener al menos ${minLength} caracteres.` })
    .max(200, { error: "La contraseña es demasiado larga." })
    .refine((v) => /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(v) && /\d/.test(v), {
      error: "La contraseña debe combinar letras y números.",
    });
}

export function changePasswordSchema(minLength: number) {
  return z
    .object({
      currentPassword: z.string().min(1, { error: "Ingresá tu contraseña actual." }),
      newPassword: newPasswordSchema(minLength),
      confirmPassword: z.string(),
    })
    .refine((v) => v.newPassword === v.confirmPassword, {
      error: "Las contraseñas no coinciden.",
      path: ["confirmPassword"],
    })
    .refine((v) => v.newPassword !== v.currentPassword, {
      error: "La nueva contraseña tiene que ser distinta de la actual.",
      path: ["newPassword"],
    });
}
export type ChangePasswordInput = z.infer<ReturnType<typeof changePasswordSchema>>;

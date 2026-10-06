import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { assertPermission, hasPermission, type Permission } from "../authz";
import type { ActorContext, RequestMeta } from "../context";
import { env } from "../env";
import { ForbiddenError, UnauthorizedError } from "../errors";
import { validateSession } from "./sessions";

export const SESSION_COOKIE = "rrhh_session";

export async function getRequestMeta(): Promise<RequestMeta> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const ip = env.TRUSTED_PROXY
    ? (h.get("x-real-ip") ?? forwarded?.split(",")[0]?.trim() ?? null)
    : (forwarded?.split(",").at(-1)?.trim() ?? null);
  return { ip, userAgent: h.get("user-agent") };
}

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/**
 * Contexto del usuario de la petición actual, o null. Se memoriza durante un
 * render (React cache); en server actions y route handlers se evalúa cada vez.
 * `connection()` lo fuerza a tiempo de petición: validar la sesión depende del
 * reloj y actualiza `lastSeenAt`, así que nunca debe correr en un prerender o prefetch.
 */
export const getCurrentContext = cache(async (): Promise<ActorContext | null> => {
  await connection();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return validateSession(token, await getRequestMeta());
});

type PageAccess = { ctx: ActorContext; allowed: true } | { ctx: ActorContext; allowed: false };

/**
 * Para páginas: sin sesión redirige al login; con contraseña temporal, al
 * cambio de contraseña. Si falta el permiso devuelve `allowed: false` para
 * que la página muestre el aviso de acceso denegado (y queda auditado).
 */
export async function requirePageAccess(permission?: Permission, module = "navegacion"): Promise<PageAccess> {
  const ctx = await getCurrentContext();
  if (!ctx) redirect("/login");
  if (ctx.mustChangePassword) redirect("/cambiar-clave");
  if (!permission || hasPermission(ctx, permission)) return { ctx, allowed: true };
  await assertPermission(ctx, permission, module).catch(() => undefined);
  return { ctx, allowed: false };
}

/**
 * Para server actions y route handlers: exige sesión y, si se indica, el permiso.
 * Con contraseña temporal solo se permiten las operaciones marcadas con `allowWhilePasswordChange`.
 */
export async function requireActionContext(
  permission: Permission | null,
  module: string,
  { allowWhilePasswordChange = false } = {},
): Promise<ActorContext> {
  const ctx = await getCurrentContext();
  if (!ctx) throw new UnauthorizedError();
  if (ctx.mustChangePassword && !allowWhilePasswordChange) {
    throw new ForbiddenError("Antes de continuar tenés que cambiar tu contraseña temporal.");
  }
  if (permission) await assertPermission(ctx, permission, module);
  return ctx;
}

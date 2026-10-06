"use server";

import { redirect } from "next/navigation";
import {
  clearSessionCookie,
  getCurrentContext,
  getRequestMeta,
  requireActionContext,
  setSessionCookie,
} from "@/server/auth/request";
import { errorResult, runAction, type ActionResult } from "@/server/errors";
import * as service from "./service";

export async function loginAction(input: unknown): Promise<ActionResult<never>> {
  let mustChangePassword: boolean;
  try {
    const result = await service.login(input, await getRequestMeta());
    await setSessionCookie(result.token, result.expiresAt);
    mustChangePassword = result.mustChangePassword;
  } catch (error) {
    return errorResult(error);
  }
  redirect(mustChangePassword ? "/cambiar-clave" : "/dashboard");
}

export async function logoutAction(): Promise<void> {
  const ctx = await getCurrentContext();
  if (ctx) await service.logout(ctx);
  await clearSessionCookie();
  redirect("/login");
}

export async function changePasswordAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext(null, "autenticacion", { allowWhilePasswordChange: true });
    await service.changeOwnPassword(ctx, input);
  });
}

"use server";

import { requireActionContext } from "@/server/auth/request";
import { runAction } from "@/server/errors";
import { z } from "@/lib/zod";
import * as service from "./service";

const MODULE = "usuarios";
const id = z.uuid();

export async function createUserAction(input: unknown) {
  return runAction(async () => service.createUser(await requireActionContext("user:manage", MODULE), input));
}

export async function updateUserAction(userId: string, input: unknown) {
  return runAction(async () =>
    service.updateUser(await requireActionContext("user:manage", MODULE), id.parse(userId), input),
  );
}

export async function resetPasswordAction(userId: string) {
  return runAction(async () =>
    service.resetPassword(await requireActionContext("user:manage", MODULE), id.parse(userId)),
  );
}

export async function unlockUserAction(userId: string) {
  return runAction(async () => service.unlockUser(await requireActionContext("user:manage", MODULE), id.parse(userId)));
}

export async function revokeSessionsAction(userId: string, sessionId?: string) {
  return runAction(async () =>
    service.revokeSessions(
      await requireActionContext("user:manage", MODULE),
      id.parse(userId),
      sessionId === undefined ? undefined : id.parse(sessionId),
    ),
  );
}

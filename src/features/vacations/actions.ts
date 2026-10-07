"use server";

import { z } from "@/lib/zod";
import { requireActionContext } from "@/server/auth/request";
import { runAction } from "@/server/errors";
import * as service from "./service";

const MODULE = "vacaciones";
const id = z.uuid();

export async function previewGenerationAction(input: unknown) {
  return runAction(async () => service.previewGeneration(await requireActionContext("leave:write", MODULE), input));
}

export async function generateBalancesAction(input: unknown) {
  return runAction(async () => service.generateBalances(await requireActionContext("leave:write", MODULE), input));
}

export async function updateBalanceAction(balanceId: string, input: unknown) {
  return runAction(async () =>
    service.updateBalance(await requireActionContext("leave:write", MODULE), id.parse(balanceId), input),
  );
}

export async function saveVacationRulesAction(input: unknown) {
  return runAction(async () => service.saveRules(await requireActionContext("config:manage", "configuracion"), input));
}

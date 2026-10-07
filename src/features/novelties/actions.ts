"use server";

import { z } from "@/lib/zod";
import { requireActionContext } from "@/server/auth/request";
import { runAction } from "@/server/errors";
import * as service from "./service";

const MODULE = "novedades";
const id = z.uuid();

/** `employeeId` en null: el empleado se elige en el formulario (listado general). */
export async function createNoveltyAction(employeeId: string | null, input: unknown) {
  return runAction(async () =>
    service.createNovelty(
      await requireActionContext("novelty:write", MODULE),
      employeeId === null ? null : id.parse(employeeId),
      input,
    ),
  );
}

export async function updateNoveltyAction(noveltyId: string, input: unknown) {
  return runAction(async () =>
    service.updateNovelty(await requireActionContext("novelty:write", MODULE), id.parse(noveltyId), input),
  );
}

export async function approveNoveltyAction(noveltyId: string) {
  return runAction(async () =>
    service.approveNovelty(await requireActionContext("novelty:write", MODULE), id.parse(noveltyId)),
  );
}

export async function reportNoveltyAction(noveltyId: string) {
  return runAction(async () =>
    service.reportNovelty(await requireActionContext("novelty:report", MODULE), id.parse(noveltyId)),
  );
}

export async function unreportNoveltyAction(noveltyId: string) {
  return runAction(async () =>
    service.unreportNovelty(await requireActionContext("novelty:report", MODULE), id.parse(noveltyId)),
  );
}

export async function annulNoveltyAction(noveltyId: string, input: unknown) {
  return runAction(async () =>
    service.annulNovelty(await requireActionContext("novelty:write", MODULE), id.parse(noveltyId), input),
  );
}

/** Aprobar (novelty:write) o marcar como informadas (novelty:report); el servicio controla cada permiso. */
export async function bulkNoveltyAction(input: unknown) {
  return runAction(async () => service.bulkUpdate(await requireActionContext("novelty:read", MODULE), input));
}

export async function previewGenerationAction(input: unknown) {
  return runAction(async () => service.previewGeneration(await requireActionContext("novelty:write", MODULE), input));
}

export async function generateNoveltiesAction(input: unknown) {
  return runAction(async () => service.generateNovelties(await requireActionContext("novelty:write", MODULE), input));
}

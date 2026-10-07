"use server";

import { z } from "@/lib/zod";
import { requireActionContext } from "@/server/auth/request";
import { runAction } from "@/server/errors";
import { CATALOG_KEYS } from "./definitions";
import * as service from "./service";

const MODULE = "configuracion";
const catalogKey = z.enum(CATALOG_KEYS);
const id = z.uuid();

export async function createCatalogItemAction(key: string, input: unknown) {
  return runAction(async () =>
    service.createCatalogItem(await requireActionContext("config:catalogs", MODULE), catalogKey.parse(key), input),
  );
}

export async function updateCatalogItemAction(key: string, itemId: string, input: unknown) {
  return runAction(async () =>
    service.updateCatalogItem(
      await requireActionContext("config:catalogs", MODULE),
      catalogKey.parse(key),
      id.parse(itemId),
      input,
    ),
  );
}

export async function setCatalogItemActiveAction(key: string, itemId: string, isActive: boolean) {
  return runAction(async () =>
    service.setCatalogItemActive(
      await requireActionContext("config:catalogs", MODULE),
      catalogKey.parse(key),
      id.parse(itemId),
      z.boolean().parse(isActive),
    ),
  );
}

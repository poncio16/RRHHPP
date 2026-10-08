import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium, type FullConfig } from "@playwright/test";

/**
 * Inicia sesión una vez y guarda la cookie para todas las pruebas. Si el
 * usuario tiene contraseña temporal (el administrador recién creado por el
 * seed), la cambia por E2E_NEW_PASSWORD.
 */
export default async function globalSetup(config: FullConfig) {
  const { baseURL, storageState } = config.projects[0]!.use;
  const email = process.env.E2E_EMAIL ?? process.env.SEED_ADMIN_EMAIL;
  const password = process.env.E2E_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("Definí E2E_EMAIL y E2E_PASSWORD (o SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD) en el entorno.");
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL });
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL(/\/(dashboard|cambiar-clave)$/);

  if (page.url().endsWith("/cambiar-clave")) {
    const next = process.env.E2E_NEW_PASSWORD;
    if (!next) {
      throw new Error("El usuario tiene una contraseña temporal: definí E2E_NEW_PASSWORD para cambiarla.");
    }
    await page.locator("#currentPassword").fill(password);
    await page.locator("#newPassword").fill(next);
    await page.locator("#confirmPassword").fill(next);
    await page.getByRole("button", { name: "Cambiar contraseña" }).click();
    await page.waitForURL(/\/dashboard$/);
  }

  const file = String(storageState);
  mkdirSync(path.dirname(file), { recursive: true });
  await page.context().storageState({ path: file });
  await browser.close();
}

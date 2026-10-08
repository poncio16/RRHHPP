import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

/*
 * Pruebas de punta a punta (pocos flujos de humo) contra la aplicación
 * compilada y la base de DATABASE_URL con el seed cargado. Por defecto
 * levanta `next start` (antes hay que correr `npm run build`); con
 * E2E_BASE_URL usa un servidor ya levantado.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  // Comparten la base: en serie.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    storageState: "tests/e2e/.auth/admin.json",
    locale: "es-AR",
    timezoneId: "America/Argentina/Buenos_Aires",
    trace: "retain-on-failure",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run start -- -p ${PORT}`,
        url: `${baseURL}/login`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});

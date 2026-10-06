import { fileURLToPath } from "node:url";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    // "server-only" falla fuera del bundler de Next; en tests se reemplaza por un módulo vacío.
    alias: { "server-only": fileURLToPath(new URL("./tests/support/server-only.ts", import.meta.url)) },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          globalSetup: ["tests/integration/global-setup.ts"],
          setupFiles: ["tests/integration/setup.ts"],
          // Comparten una base de datos: se ejecutan en serie.
          fileParallelism: false,
        },
      },
    ],
  },
});

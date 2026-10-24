import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed/index.ts",
  },
  datasource: {
    // Las migraciones van por la conexión directa: en Neon, DATABASE_URL pasa por
    // el pooler, que no sirve para migrar. Con Docker no hace falta definirla.
    url: process.env["DIRECT_URL"] || process.env["DATABASE_URL"],
  },
});

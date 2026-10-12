import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { formatSeedSummary, resolveSeedMode, runSeed } from "./run";

/**
 * Seed idempotente: se puede ejecutar varias veces sin duplicar datos ni
 * pisar cambios hechos desde la aplicación (solo crea lo que falta).
 *
 * - `npm run db:seed`: datos base y de demostración (en desarrollo).
 * - `npm run db:seed:base`: solo datos base, sin empresa ni personas ficticias.
 * - Con NODE_ENV=production se cargan solo los datos base, siempre.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL (ver .env.example).");
  const mode = resolveSeedMode(process.env.NODE_ENV, process.argv.slice(2));
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  try {
    const result = await runSeed(db, { demo: mode.demo });
    console.log(formatSeedSummary(mode, result));
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

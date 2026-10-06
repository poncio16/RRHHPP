import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { LOOKUP_VALUES, PROVINCES } from "./reference-data";

/**
 * Seed idempotente: se puede ejecutar varias veces sin duplicar datos ni
 * pisar cambios hechos desde la aplicación (solo crea lo que falta).
 * Cada fase agrega sus datos (roles y usuarios en la Fase 3, empresa y
 * catálogos en la Fase 4, empleados de demostración en la Fase 5).
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL (ver .env.example).");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  try {
    await db.province.createMany({ data: PROVINCES, skipDuplicates: true });

    const lookups = Object.entries(LOOKUP_VALUES).flatMap(([group, values]) =>
      values.map((v, i) => ({ group, code: v.code, label: v.label, sortOrder: i })),
    );
    await db.lookupValue.createMany({ data: lookups, skipDuplicates: true });

    const [provinces, lookupValues] = await Promise.all([db.province.count(), db.lookupValue.count()]);
    console.log(`Seed completo: ${provinces} provincias, ${lookupValues} valores de listas.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

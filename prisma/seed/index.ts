import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { LOOKUP_VALUES, PROVINCES } from "./reference-data";
import { seedAttendance } from "./attendance";
import { seedDocuments } from "./documents";
import { seedEmployees } from "./employees";
import { seedExits } from "./exits";
import { seedLeaves } from "./leaves";
import { seedOrganization } from "./organization";
import { seedSalaries } from "./salaries";
import { seedSecurity } from "./security";

/**
 * Seed idempotente: se puede ejecutar varias veces sin duplicar datos ni
 * pisar cambios hechos desde la aplicación (solo crea lo que falta).
 * Cada fase agrega sus datos de demostración.
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

    const security = await seedSecurity(db);
    await seedOrganization(db);
    const employeesCreated = await seedEmployees(db);
    const documentsCreated = await seedDocuments(db);
    const leaves = await seedLeaves(db);
    const attendance = await seedAttendance(db);
    const salaries = await seedSalaries(db);
    const exits = await seedExits(db);

    const [provinces, lookupValues, roles] = await Promise.all([
      db.province.count(),
      db.lookupValue.count(),
      db.role.count(),
    ]);
    console.log(
      `Seed completo: ${provinces} provincias, ${lookupValues} valores de listas, ${roles} roles, ${employeesCreated} empleados, ${documentsCreated} documentos, ${leaves.types} tipos de licencia, ${leaves.balances} períodos de vacaciones, ${leaves.records} licencias, ${attendance} días de asistencia, ${salaries.salaries} básicos, ${salaries.payrolls} resúmenes informados, ${salaries.novelties} novedades y ${exits} egresos nuevos.`,
    );
    if (security.adminCreated) {
      console.log(`Administrador inicial: ${security.email} (debe cambiar la contraseña al ingresar).`);
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

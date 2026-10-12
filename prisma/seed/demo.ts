import type { PrismaClient } from "../../src/generated/prisma/client";
import { seedAttendance } from "./attendance";
import { seedDemoDocuments } from "./documents";
import { seedEmployees } from "./employees";
import { seedExits } from "./exits";
import { seedDemoLeaves } from "./leaves";
import { seedOrganization } from "./organization";
import { seedDemoSalaries } from "./salaries";

/** Cantidad de registros creados en esta corrida (0 si ya existían). */
export type DemoSummary = {
  company: number;
  employees: number;
  documents: number;
  balances: number;
  leaves: number;
  attendance: number;
  salaries: number;
  payrolls: number;
  novelties: number;
  exits: number;
};

/**
 * Datos de demostración (ficticios): empresa y estructura, 24 empleados,
 * documentos con sus archivos en STORAGE_DIR, períodos de vacaciones,
 * licencias, asistencia, básicos, resúmenes informados, novedades y egresos.
 * Nunca se cargan en producción. Requiere los datos base (`base.ts`).
 *
 * Idempotente: solo crea lo que falta; lo que depende de la fecha de hoy se
 * carga una sola vez.
 */
export async function seedDemo(db: PrismaClient): Promise<DemoSummary> {
  const { company } = await seedOrganization(db);
  const employees = await seedEmployees(db);
  const documents = await seedDemoDocuments(db);
  const leaves = await seedDemoLeaves(db);
  const attendance = await seedAttendance(db);
  const salaries = await seedDemoSalaries(db);
  const exits = await seedExits(db);

  return {
    company,
    employees,
    documents,
    balances: leaves.balances,
    leaves: leaves.records,
    attendance,
    ...salaries,
    exits,
  };
}

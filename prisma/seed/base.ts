import type { PrismaClient } from "../../src/generated/prisma/client";
import { seedDocumentTypes } from "./documents";
import { seedLeaveCatalog } from "./leaves";
import { seedGeneralCatalogs } from "./organization";
import { seedReferenceData } from "./reference-data";
import { seedSalaryCatalog } from "./salaries";
import { type InitialAdmin, initialAdminFromEnv, seedSecurity } from "./security";

/** Cantidad de registros creados en esta corrida (0 si ya existían). */
export type BaseSummary = {
  provinces: number;
  lookupValues: number;
  roles: number;
  securitySetting: number;
  documentTypes: number;
  leaveTypes: number;
  vacationRules: number;
  conceptTypes: number;
  noveltyTypes: number;
  leaveLinks: number;
  banks: number;
  contractTypes: number;
  workdayTypes: number;
  /** Email del administrador inicial, si se creó en esta corrida. */
  adminCreated: string | null;
};

/**
 * Datos base: lo que la aplicación necesita para funcionar en cualquier
 * instalación, sin personas ni empresa ficticias. Provincias y listas, roles,
 * parámetro de seguridad y administrador inicial, tipos de documento, tipos de
 * licencia y reglas de vacaciones, conceptos de remuneración y tipos de
 * novedad, bancos, tipos de contrato y tipos de jornada.
 *
 * Lo que cada empresa configura para sí (empresa, sectores, puestos, convenios
 * y categorías, obras sociales, ART, establecimientos y horarios) es de
 * demostración: ver `demo.ts`.
 *
 * Idempotente: solo crea lo que falta y nunca pisa lo editado desde la aplicación.
 */
export async function seedBase(db: PrismaClient, admin: InitialAdmin = initialAdminFromEnv()): Promise<BaseSummary> {
  const reference = await seedReferenceData(db);
  const security = await seedSecurity(db, admin);
  const documentTypes = await seedDocumentTypes(db);
  // Los tipos de licencia van antes que los de novedad: estos se vinculan a aquellos.
  const leaves = await seedLeaveCatalog(db);
  const salaries = await seedSalaryCatalog(db);
  const general = await seedGeneralCatalogs(db);

  return {
    ...reference,
    roles: security.roles,
    securitySetting: security.securitySetting,
    documentTypes,
    ...leaves,
    ...salaries,
    ...general,
    adminCreated: security.adminCreated ? security.email : null,
  };
}

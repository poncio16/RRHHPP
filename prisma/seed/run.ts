import type { PrismaClient } from "../../src/generated/prisma/client";
import { type BaseSummary, seedBase } from "./base";
import { type DemoSummary, seedDemo } from "./demo";
import type { InitialAdmin } from "./security";

/** Opción de línea de comandos que limita el seed a los datos base. */
export const BASE_ONLY_FLAG = "--base";

export type SeedMode = { demo: true } | { demo: false; reason: string };

/**
 * Los datos de demostración se cargan solo fuera de producción y si no se
 * pidió `--base`. En producción se cargan únicamente los datos base, aunque
 * se ejecute `npm run db:seed`.
 */
export function resolveSeedMode(nodeEnv: string | undefined, args: readonly string[]): SeedMode {
  if (nodeEnv === "production") return { demo: false, reason: "NODE_ENV=production" };
  if (args.includes(BASE_ONLY_FLAG)) return { demo: false, reason: `opción ${BASE_ONLY_FLAG}` };
  return { demo: true };
}

export type SeedResult = { base: BaseSummary; demo: DemoSummary | null };

export async function runSeed(db: PrismaClient, options: { demo: boolean; admin?: InitialAdmin }): Promise<SeedResult> {
  const base = await seedBase(db, options.admin);
  const demo = options.demo ? await seedDemo(db) : null;
  return { base, demo };
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} y ${items.at(-1)}`;
}

/** Enumera lo creado; si no se creó nada, lo dice. */
function created(items: [number, string, string][]): string {
  const parts = items.filter(([n]) => n > 0).map(([n, one, many]) => count(n, one, many));
  return parts.length > 0 ? `${list(parts)}.` : "nada nuevo (ya estaba todo cargado).";
}

/** Resumen legible de la corrida, en castellano. */
export function formatSeedSummary(mode: SeedMode, result: SeedResult): string {
  const { base, demo } = result;
  const lines = [
    mode.demo
      ? "Seed: Datos base y de demostración."
      : `Seed: Datos base (${mode.reason}: no se cargan datos de demostración).`,
    `- Datos base: ${created([
      [base.provinces, "provincia", "provincias"],
      [base.lookupValues, "valor de lista", "valores de listas"],
      [base.roles, "rol", "roles"],
      [base.securitySetting, "parámetro de seguridad", "parámetros de seguridad"],
      [base.documentTypes, "tipo de documento", "tipos de documento"],
      [base.leaveTypes, "tipo de licencia", "tipos de licencia"],
      [base.vacationRules, "regla de vacaciones", "reglas de vacaciones"],
      [base.conceptTypes, "concepto de remuneración", "conceptos de remuneración"],
      [base.noveltyTypes, "tipo de novedad", "tipos de novedad"],
      [base.leaveLinks, "licencia vinculada a su novedad", "licencias vinculadas a su novedad"],
      [base.banks, "banco", "bancos"],
      [base.contractTypes, "tipo de contrato", "tipos de contrato"],
      [base.workdayTypes, "tipo de jornada", "tipos de jornada"],
    ])}`,
  ];
  if (demo) {
    lines.push(
      `- Datos de demostración: ${created([
        [demo.company, "empresa", "empresas"],
        [demo.employees, "empleado", "empleados"],
        [demo.documents, "documento", "documentos"],
        [demo.balances, "período de vacaciones", "períodos de vacaciones"],
        [demo.leaves, "licencia", "licencias"],
        [demo.attendance, "día de asistencia", "días de asistencia"],
        [demo.salaries, "básico", "básicos"],
        [demo.payrolls, "resumen informado", "resúmenes informados"],
        [demo.novelties, "novedad", "novedades"],
        [demo.exits, "egreso", "egresos"],
      ])}`,
    );
  }
  if (base.adminCreated) {
    lines.push(`Administrador inicial: ${base.adminCreated} (debe cambiar la contraseña al ingresar).`);
  }
  return lines.join("\n");
}

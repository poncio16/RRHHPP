import { execSync, spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { DEFAULT_ROLES } from "@/server/authz/roles";
import { PROVINCES } from "../../prisma/seed/reference-data";
import { resolveSeedMode, runSeed } from "../../prisma/seed/run";

/**
 * El seed se prueba contra una base propia y vacía (la de test con el sufijo
 * "_seed"), recreada con las migraciones: la base de test compartida ya tiene
 * datos de los demás archivos.
 */
const testUrl = new URL(process.env.TEST_DATABASE_URL!);
const cleanName = `${decodeURIComponent(testUrl.pathname.slice(1))}_seed`;
const cleanUrl = new URL(testUrl.href);
cleanUrl.pathname = `/${cleanName}`;
const storageDir = process.env.STORAGE_DIR!;

let seedDb: PrismaClient;

async function adminQuery(sql: string) {
  const client = new Client({ connectionString: testUrl.href });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

beforeAll(async () => {
  await adminQuery(`DROP DATABASE IF EXISTS "${cleanName}" WITH (FORCE)`);
  await adminQuery(`CREATE DATABASE "${cleanName}"`);
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, DATABASE_URL: cleanUrl.href } });
  seedDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: cleanUrl.href }) });
}, 120_000);

afterAll(async () => {
  await seedDb?.$disconnect();
  await adminQuery(`DROP DATABASE IF EXISTS "${cleanName}" WITH (FORCE)`);
}, 60_000);

/** Registros de todo lo que es de demostración (empresa, estructura, personas y sus datos). */
async function demoCounts(db: PrismaClient) {
  return {
    company: await db.company.count(),
    department: await db.department.count(),
    position: await db.position.count(),
    collectiveAgreement: await db.collectiveAgreement.count(),
    category: await db.category.count(),
    healthInsurer: await db.healthInsurer.count(),
    artProvider: await db.artProvider.count(),
    workplace: await db.workplace.count(),
    workSchedule: await db.workSchedule.count(),
    employee: await db.employee.count(),
    bankAccount: await db.employeeBankAccount.count(),
    storedFile: await db.storedFile.count(),
    document: await db.document.count(),
    vacationBalance: await db.vacationBalance.count(),
    leaveRecord: await db.leaveRecord.count(),
    attendanceDay: await db.attendanceDay.count(),
    salaryHistory: await db.salaryHistory.count(),
    payrollRecord: await db.payrollRecord.count(),
    novelty: await db.novelty.count(),
    employeeExit: await db.employeeExit.count(),
  };
}

const allZero = (counts: Record<string, number>) => Object.fromEntries(Object.keys(counts).map((k) => [k, 0]));

/** Contenido completo de las tablas de datos base, para comparar dos corridas. */
async function baseSnapshot(db: PrismaClient) {
  const tables = {
    province: await db.province.findMany(),
    lookupValue: await db.lookupValue.findMany(),
    role: await db.role.findMany(),
    rolePermission: await db.rolePermission.findMany(),
    setting: await db.setting.findMany(),
    user: await db.user.findMany(),
    documentType: await db.documentType.findMany(),
    leaveType: await db.leaveType.findMany(),
    vacationRule: await db.vacationRule.findMany(),
    salaryConceptType: await db.salaryConceptType.findMany(),
    noveltyType: await db.noveltyType.findMany(),
    bank: await db.bank.findMany(),
    contractType: await db.contractType.findMany(),
    workdayType: await db.workdayType.findMany(),
  };
  return Object.fromEntries(
    Object.entries(tables).map(([table, rows]) => [table, rows.map((row) => JSON.stringify(row)).sort()]),
  );
}

function storedFiles(): string[] {
  return readdirSync(storageDir, { recursive: true, encoding: "utf8" }).filter((entry) =>
    statSync(path.join(storageDir, entry)).isFile(),
  );
}

describe("seed: datos base", () => {
  it("en una base vacía crea roles, administrador y catálogos, sin empresa ni personas", async () => {
    const result = await runSeed(seedDb, {
      demo: false,
      admin: { email: " Admin.Base@Test.Local ", password: "ClaveInicial123" },
    });

    expect(result.demo).toBeNull();
    expect(result.base).toMatchObject({
      provinces: PROVINCES.length,
      roles: DEFAULT_ROLES.length,
      securitySetting: 1,
      adminCreated: "admin.base@test.local",
    });

    const admins = await seedDb.user.findMany({ include: { role: true } });
    expect(admins).toHaveLength(1);
    expect(admins[0]).toMatchObject({
      email: "admin.base@test.local",
      name: "Administrador",
      isActive: true,
      mustChangePassword: true,
      role: { code: "ADMIN" },
    });
    expect(admins[0]!.passwordHash).not.toContain("ClaveInicial123");

    expect(await seedDb.role.count()).toBe(DEFAULT_ROLES.length);
    expect(await seedDb.setting.findUnique({ where: { key: "security" } })).not.toBeNull();
    expect(await seedDb.province.count()).toBe(PROVINCES.length);
    for (const count of [
      seedDb.lookupValue.count(),
      seedDb.documentType.count(),
      seedDb.leaveType.count(),
      seedDb.vacationRule.count(),
      seedDb.salaryConceptType.count(),
      seedDb.noveltyType.count(),
      seedDb.bank.count(),
      seedDb.contractType.count(),
      seedDb.workdayType.count(),
    ]) {
      expect(await count).toBeGreaterThan(0);
    }
    const absence = await seedDb.leaveType.findUniqueOrThrow({
      where: { name: "Ausencia sin aviso" },
      include: { generatesNoveltyType: true },
    });
    expect(absence.generatesNoveltyType?.name).toBe("Ausencia");

    const counts = await demoCounts(seedDb);
    expect(counts).toEqual(allZero(counts));
    expect(storedFiles()).toEqual([]);
  }, 60_000);

  it("correrlo otra vez no cambia nada", async () => {
    const before = await baseSnapshot(seedDb);

    const result = await runSeed(seedDb, {
      demo: false,
      admin: { email: "otro-admin@test.local", password: "OtraClave123" },
    });

    expect(Object.values(result.base).every((value) => value === 0 || value === null)).toBe(true);
    expect(await baseSnapshot(seedDb)).toEqual(before);
    expect(await seedDb.user.count()).toBe(1);
  }, 60_000);
});

describe("seed: datos de demostración", () => {
  it("se cargan solo fuera de producción y sin --base", () => {
    expect(resolveSeedMode("development", [])).toEqual({ demo: true });
    expect(resolveSeedMode(undefined, [])).toEqual({ demo: true });
    expect(resolveSeedMode("test", [])).toEqual({ demo: true });
    expect(resolveSeedMode("development", ["--base"])).toMatchObject({ demo: false });
    expect(resolveSeedMode("production", [])).toMatchObject({ demo: false });
    expect(resolveSeedMode("production", ["--base"])).toMatchObject({ demo: false });
  });

  it("en producción el comando del seed carga solo los datos base", async () => {
    const run = spawnSync("npx", ["tsx", "prisma/seed/index.ts"], {
      encoding: "utf8",
      env: { ...process.env, NODE_ENV: "production", DATABASE_URL: cleanUrl.href, STORAGE_DIR: storageDir },
    });

    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain("Seed: Datos base (NODE_ENV=production");
    expect(run.stdout).not.toContain("Datos de demostración:");
    const counts = await demoCounts(seedDb);
    expect(counts).toEqual(allZero(counts));
    expect(storedFiles()).toEqual([]);
  }, 60_000);

  it("en desarrollo se agregan sobre los datos base, sin duplicarse", async () => {
    const first = await runSeed(seedDb, { demo: true });
    expect(first.demo).toMatchObject({ company: 1, employees: 24 });
    expect(first.demo!.documents).toBeGreaterThan(0);
    expect(first.demo!.leaves).toBeGreaterThan(0);
    const counts = await demoCounts(seedDb);
    const files = storedFiles();
    expect(files.length).toBeGreaterThan(0);

    const second = await runSeed(seedDb, { demo: true });
    expect(Object.values(second.demo!).every((value) => value === 0)).toBe(true);
    expect(await demoCounts(seedDb)).toEqual(counts);
    expect(storedFiles()).toHaveLength(files.length);
  }, 120_000);
});

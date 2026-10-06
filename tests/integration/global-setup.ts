import "dotenv/config";
import { execSync } from "node:child_process";
import { Client } from "pg";

/** Recrea la base de test desde cero y aplica todas las migraciones. */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("Falta TEST_DATABASE_URL (ver .env.example) para los tests de integración.");
  if (url === process.env.DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL no puede ser la misma base que DATABASE_URL: los tests la borran.");
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  await client.end();

  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
}

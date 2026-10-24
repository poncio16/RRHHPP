import { spawnSync } from "node:child_process";

/**
 * Build en Vercel (vercel.json → `npm run vercel-build`). En producción, antes
 * de construir aplica las migraciones pendientes y el seed base, que es
 * idempotente: crea los roles y el administrador inicial solo si faltan. Las
 * vistas previas (si alguien las activa) no tocan la base.
 *
 * Si el build falla después de migrar, sigue atendiendo la versión anterior
 * con la base ya migrada: las migraciones tienen que ser compatibles con la
 * versión anterior (agregar, no renombrar ni borrar).
 */
function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (process.env.VERCEL_ENV === "production") {
  if (!process.env.DIRECT_URL) {
    console.error(
      "Falta DIRECT_URL: la conexión directa a la base (en Neon, la que no pasa por el pooler). Ver docs/vercel.md.",
    );
    process.exit(1);
  }
  run("npx", ["prisma", "migrate", "deploy"]);
  run("npm", ["run", "db:seed:base"]);
} else {
  console.log(`Entorno ${process.env.VERCEL_ENV ?? "local"}: no se aplican migraciones ni el seed.`);
}
run("npx", ["next", "build"]);

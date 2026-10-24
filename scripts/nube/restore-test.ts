/**
 * Prueba de restauración de la instalación en Vercel y Neon (la corre GitHub
 * Actions todos los domingos: .github/workflows/backup-nube.yml; ver
 * docs/vercel.md). No toca la base ni los archivos de la aplicación.
 *
 *   DIRECT_URL=... BACKUP_BLOB_TOKEN=... npx tsx scripts/nube/restore-test.ts [rrhh-AAAAMMDDTHHMMSSZ]
 *
 * Restaura el backup (por defecto, el último completo) en un PostgreSQL
 * descartable de la misma versión que Neon y verifica:
 *   - la suma SHA-256 del dump;
 *   - que el dump se restaure completo, sin errores;
 *   - que estén aplicadas todas las migraciones de esta versión de la app;
 *   - que la bitácora de auditoría siga protegida contra cambios (triggers);
 *   - que cada archivo registrado en la base esté en el almacén de backups con
 *     su SHA-256.
 *
 * Al terminar, bien o mal, registra el resultado en la base de la aplicación
 * (tabla backup_run) para el aviso del inicio.
 */
import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  backupFolders,
  backupStore,
  DUMP,
  FILES_PREFIX,
  logUnexpected,
  onInterrupt,
  plural,
  recordRun,
  removeTempDir,
  requireEnv,
  serverMajor,
  sha256,
  startScratchPostgres,
  StepError,
  Steps,
  SUMS,
  tempDir,
  thousands,
} from "./lib";

const TEST_DB = "rrhh_prueba_restauracion";

async function main(): Promise<number> {
  const steps = new Steps();
  let name = process.argv[2]?.trim() ?? "";
  let scratch: Awaited<ReturnType<typeof startScratchPostgres>> | undefined;
  const problems: string[] = [];
  onInterrupt(async () => {
    console.error(`Prueba de restauración FALLIDA: ${steps.interrupted()}`);
    await recordRun("PRUEBA_RESTAURACION", false, name, steps.interrupted());
    await scratch?.stop();
    await removeTempDir();
  });
  const fail = (problem: string) => {
    console.error(`ERROR: ${problem}.`);
    problems.push(problem);
  };
  try {
    const url = requireEnv("DIRECT_URL");
    const backups = backupStore();

    steps.at("al buscar el backup");
    const complete = (await backupFolders(backups)).filter((folder) => folder.complete);
    const folder = name ? complete.find((f) => f.name === name) : complete.at(-1);
    if (!folder) throw new StepError(name ? `no hay un backup completo ${name}` : "no hay ningún backup completo");
    name = folder.name;
    console.log(`Backup: ${name}`);

    steps.at("al verificar la suma SHA-256", "Verificando la suma SHA-256...");
    const [dumpBytes, sums] = await Promise.all([backups.read(`${name}/${DUMP}`), backups.read(`${name}/${SUMS}`)]);
    if (!dumpBytes || !sums) throw new StepError("el backup está incompleto");
    if (!sums.toString().startsWith(`${sha256(dumpBytes)}  ${DUMP}`)) throw new StepError("el dump no coincide");
    const dump = path.join(await tempDir(), DUMP);
    await writeFile(dump, dumpBytes);

    steps.at("al restaurar en una base temporal", "Restaurando en una base temporal...");
    scratch = await startScratchPostgres(await serverMajor(url));
    const code = await scratch.restore(TEST_DB, dump);
    // El detalle de pg_restore no se muestra: puede traer valores de una fila.
    if (code !== 0) throw new StepError(`pg_restore terminó con código ${code}`);
    const sql = (text: string) => scratch!.psql(TEST_DB, text);

    steps.at("al verificar las migraciones", "Verificando migraciones...");
    const applied = Number(
      await sql("SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL"),
    );
    const shipped = (await readdir("prisma/migrations", { withFileTypes: true })).filter((e) => e.isDirectory()).length;
    if (applied === shipped) console.log(`  ${applied} migraciones aplicadas, las mismas que trae esta versión.`);
    else if (applied < shipped) {
      console.log(
        `  El backup tiene ${applied} migraciones y esta versión trae ${shipped}: al restaurarlo se aplican las que faltan.`,
      );
    } else {
      fail(
        `el backup tiene ${applied} migraciones y esta versión solo ${shipped}: es de una versión más nueva de la aplicación`,
      );
    }

    steps.at("al verificar la protección de la auditoría", "Verificando la protección de la auditoría...");
    const triggers = Number(
      await sql("SELECT count(*) FROM pg_trigger WHERE tgrelid = 'audit_log'::regclass AND NOT tgisinternal"),
    );
    if (triggers >= 2) console.log(`  audit_log sigue siendo de solo inserción (${triggers} triggers).`);
    else fail(`faltan los triggers que impiden modificar audit_log (hay ${triggers})`);

    steps.at("al verificar los archivos adjuntos", "Verificando los archivos adjuntos...");
    const expected = (await sql("SELECT storage_key || ' ' || sha256 FROM stored_file ORDER BY storage_key"))
      .split("\n")
      .filter(Boolean)
      .map((line) => line.split(" ") as [string, string]);
    let bad = 0;
    for (const [key, hash] of expected) {
      const data = await backups.read(FILES_PREFIX + key);
      if (!data || sha256(data) !== hash) bad++;
    }
    if (expected.length === 0) console.log("  La base no tiene archivos registrados.");
    else if (bad === 0)
      console.log(
        `  Los archivos registrados en la base (${thousands(expected.length)}) están en el backup, sin cambios.`,
      );
    else
      fail(
        plural(
          bad,
          "archivo registrado en la base falta en el backup o no coincide",
          "archivos registrados en la base faltan en el backup o no coinciden",
        ),
      );

    steps.at("al contar las filas", "Contando las filas...");
    const tables = (await sql("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"))
      .split("\n")
      .filter(Boolean);
    let rows = 0;
    for (const table of tables) rows += Number(await sql(`SELECT count(*) FROM "${table}"`));

    if (problems.length > 0) {
      const detail = `${plural(problems.length, "problema", "problemas")}: ${problems.join("; ")}.`;
      console.error(`Prueba de restauración FALLIDA para ${name}: ${detail}`);
      await recordRun("PRUEBA_RESTAURACION", false, name, detail);
      return 1;
    }
    const summary = `${plural(rows, "fila", "filas")}, ${plural(expected.length, "archivo", "archivos")}`;
    await recordRun("PRUEBA_RESTAURACION", true, name, `${summary}.`);
    console.log(`Prueba de restauración correcta para ${name}: ${summary}.`);
    return 0;
  } catch (error) {
    const reason = steps.reason(error);
    console.error(`Prueba de restauración FALLIDA: ${reason}`);
    logUnexpected(error);
    const detail =
      problems.length > 0
        ? `${plural(problems.length, "problema", "problemas")}: ${problems.join("; ")}. ${reason}`
        : reason;
    await recordRun("PRUEBA_RESTAURACION", false, name, detail);
    return 1;
  } finally {
    await scratch?.stop();
    await removeTempDir();
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  () => {
    process.exitCode = 1;
  },
);

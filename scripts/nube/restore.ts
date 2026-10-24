/**
 * Restauración de un backup de la instalación en Vercel y Neon en una base
 * NUEVA y vacía (se corre a mano desde GitHub Actions:
 * .github/workflows/restaurar-nube.yml; ver docs/vercel.md).
 *
 *   RESTORE_DIRECT_URL=... APP_BLOB_TOKEN=... BACKUP_BLOB_TOKEN=... RESTORE_CONFIRM=RESTAURAR \
 *     npx tsx scripts/nube/restore.ts [rrhh-AAAAMMDDTHHMMSSZ]
 *
 * No toca la base en uso: restaura en la de RESTORE_DIRECT_URL, que tiene que
 * estar vacía (se niega si tiene tablas). Cierra las sesiones que vienen con el
 * backup y copia al almacén de la aplicación los adjuntos que le falten (cada
 * uno tiene un nombre único: no se pisa ni se borra ninguno). Después hay que
 * apuntar la aplicación a esa base y volver a publicarla, que aplica las
 * migraciones pendientes si el backup es de una versión anterior.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  appStore,
  backupFolders,
  backupStore,
  docker,
  DUMP,
  FILES_PREFIX,
  logUnexpected,
  onInterrupt,
  plural,
  postgresImage,
  query,
  removeTempDir,
  requireEnv,
  RESTORE_OPTIONS,
  serverMajor,
  sha256,
  StepError,
  Steps,
  SUMS,
  tempDir,
} from "./lib";

async function main(): Promise<number> {
  const steps = new Steps();
  onInterrupt(async () => {
    console.error(`Restauración FALLIDA: ${steps.interrupted()}`);
    await removeTempDir();
  });
  try {
    steps.at("en la confirmación");
    if (process.env.RESTORE_CONFIRM?.trim() !== "RESTAURAR") throw new StepError("hay que escribir RESTAURAR");
    const target = requireEnv("RESTORE_DIRECT_URL");
    const backups = backupStore();
    const app = appStore();
    const requested = process.argv[2]?.trim() ?? "";

    steps.at("al buscar el backup");
    const complete = (await backupFolders(backups)).filter((folder) => folder.complete);
    const folder = requested ? complete.find((f) => f.name === requested) : complete.at(-1);
    if (!folder)
      throw new StepError(requested ? `no hay un backup completo ${requested}` : "no hay ningún backup completo");
    console.log(`Backup: ${folder.name}`);

    steps.at("al verificar la suma SHA-256", "Verificando la suma SHA-256...");
    const [dumpBytes, sums] = await Promise.all([
      backups.read(`${folder.name}/${DUMP}`),
      backups.read(`${folder.name}/${SUMS}`),
    ]);
    if (!dumpBytes || !sums) throw new StepError("el backup está incompleto");
    if (!sums.toString().startsWith(`${sha256(dumpBytes)}  ${DUMP}`)) throw new StepError("el dump no coincide");
    const dump = path.join(await tempDir(), DUMP);
    await writeFile(dump, dumpBytes);

    steps.at("al revisar la base de destino", "Revisando que la base de destino esté vacía...");
    const [row] = await query<{ tables: string }>(
      target,
      "SELECT count(*) AS tables FROM pg_tables WHERE schemaname = 'public'",
    );
    if (Number(row!.tables) > 0) {
      throw new StepError("la base de destino no está vacía; creá una base nueva para restaurar");
    }

    steps.at("al restaurar la base", "Restaurando la base...");
    process.env.RRHH_RESTORE_URL = target;
    try {
      const restored = await docker(
        [
          "run",
          "--rm",
          "-i",
          "--network",
          "host",
          "-e",
          "RRHH_RESTORE_URL",
          postgresImage(await serverMajor(target)),
          "sh",
          "-c",
          `exec pg_restore ${RESTORE_OPTIONS.join(" ")} -d "$RRHH_RESTORE_URL"`,
        ],
        { stdin: dump },
      );
      // El detalle de pg_restore no se muestra: puede traer valores de una fila.
      if (restored.code !== 0) throw new StepError(`pg_restore terminó con código ${restored.code}`);
    } finally {
      delete process.env.RRHH_RESTORE_URL;
    }
    // Las sesiones abiertas en el momento del backup vuelven con él: se cierran
    // todas y cada usuario vuelve a ingresar.
    await query(target, "UPDATE session SET revoked_at = now() WHERE revoked_at IS NULL");

    steps.at("al restaurar los archivos adjuntos", "Restaurando los archivos adjuntos que faltan...");
    const files = await query<{ storage_key: string; sha256: string }>(
      target,
      "SELECT storage_key, sha256 FROM stored_file ORDER BY storage_key",
    );
    const present = new Set((await app.list("")).map((e) => e.pathname));
    let added = 0;
    let bad = 0;
    for (const file of files) {
      if (present.has(file.storage_key)) continue;
      const data = await backups.read(FILES_PREFIX + file.storage_key);
      if (!data || sha256(data) !== file.sha256) bad++;
      else {
        await app.write(file.storage_key, data);
        added++;
      }
    }
    if (bad > 0) {
      throw new StepError(
        `${plural(bad, "archivo falta en el backup o no coincide", "archivos faltan en el backup o no coinciden")}; la base quedó restaurada`,
      );
    }

    console.log(
      `Restauración completa desde ${folder.name}: ${plural(files.length, "adjunto", "adjuntos")} (${added} copiados al almacén de la aplicación).`,
    );
    console.log(
      "Ahora cambiá DATABASE_URL y DIRECT_URL en Vercel (y el secreto DIRECT_URL en GitHub) por los de la base restaurada y volvé a publicar la aplicación. Después corré un backup y una prueba de restauración: hasta entonces, el Inicio puede mostrarlos como atrasados o fallidos.",
    );
    return 0;
  } catch (error) {
    console.error(`Restauración FALLIDA: ${steps.reason(error)}`);
    logUnexpected(error);
    return 1;
  } finally {
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

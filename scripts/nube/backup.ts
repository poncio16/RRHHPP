/**
 * Backup de la instalación en Vercel y Neon (lo corre GitHub Actions todos los
 * días: .github/workflows/backup-nube.yml; ver docs/vercel.md).
 *
 *   DIRECT_URL=... APP_BLOB_TOKEN=... BACKUP_BLOB_TOKEN=... npx tsx scripts/nube/backup.ts
 *
 * 1. Copia la base con pg_dump (formato custom) a `rrhh-AAAAMMDDTHHMMSSZ/base.dump`
 *    en el almacén de backups.
 * 2. Copia a `archivos/` los adjuntos que todavía no estaban, verificando su
 *    SHA-256 contra la base. Primero la base y después los archivos: un archivo
 *    se guarda antes que su registro y nunca se reemplaza, así que todo lo que
 *    figura en el dump queda copiado.
 * 3. Escribe `SHA256SUMS`, que marca el backup como completo.
 * 4. Borra los backups más viejos que BACKUP_RETENTION_DAYS (30 por defecto) y
 *    los que quedaron a medias. Los adjuntos no se borran: los usan todos.
 *
 * Al terminar, bien o mal, registra el resultado en la base (tabla backup_run)
 * para el aviso del inicio de la aplicación.
 */
import path from "node:path";
import { readFile } from "node:fs/promises";
import {
  appStore,
  backupFolders,
  backupName,
  backupStore,
  DUMP,
  dumpDatabase,
  FILES_PREFIX,
  humanSize,
  logUnexpected,
  onInterrupt,
  plural,
  query,
  recordRun,
  removeTempDir,
  requireEnv,
  serverMajor,
  sha256,
  StepError,
  Steps,
  SUMS,
  tempDir,
  thousands,
} from "./lib";

async function main(): Promise<number> {
  const steps = new Steps();
  onInterrupt(async () => {
    console.error(`Backup FALLIDO: ${steps.interrupted()}`);
    await recordRun("BACKUP", false, "", steps.interrupted());
    await removeTempDir();
  });
  const name = backupName();
  try {
    const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS?.trim() || "30");
    if (!Number.isInteger(retentionDays) || retentionDays < 1) {
      steps.at("en BACKUP_RETENTION_DAYS");
      throw new StepError("tiene que ser un número de días");
    }
    const url = requireEnv("DIRECT_URL");
    const backups = backupStore();
    const app = appStore();

    steps.at("al copiar la base de datos", "Copiando la base de datos...");
    const dump = path.join(await tempDir(), DUMP);
    await dumpDatabase(url, await serverMajor(url), dump);
    const dumpBytes = await readFile(dump);

    steps.at("al guardar la copia de la base", "Guardando la copia de la base...");
    await backups.write(`${name}/${DUMP}`, dumpBytes);

    steps.at("al copiar los archivos adjuntos", "Copiando los archivos adjuntos nuevos...");
    const files = await query<{ storage_key: string; sha256: string }>(
      url,
      "SELECT storage_key, sha256 FROM stored_file ORDER BY storage_key",
    );
    const copied = new Set((await backups.list(FILES_PREFIX)).map((e) => e.pathname));
    let added = 0;
    let missing = 0;
    let changed = 0;
    for (const file of files) {
      if (copied.has(FILES_PREFIX + file.storage_key)) continue;
      const data = await app.read(file.storage_key);
      if (!data) missing++;
      else if (sha256(data) !== file.sha256) changed++;
      else {
        await backups.write(FILES_PREFIX + file.storage_key, data);
        added++;
      }
    }

    // Aunque falten adjuntos, la copia de la base sirve: el backup se cierra igual.
    steps.at("al guardar el backup", "Cerrando el backup...");
    await backups.write(`${name}/${SUMS}`, Buffer.from(`${sha256(dumpBytes)}  ${DUMP}\n`));

    if (missing + changed > 0) {
      const problems = [
        missing > 0 &&
          `${plural(missing, "archivo registrado falta", "archivos registrados faltan")} en el almacén de la aplicación`,
        changed > 0 && `${plural(changed, "archivo no coincide", "archivos no coinciden")} con su SHA-256`,
      ].filter(Boolean);
      steps.at("al copiar los archivos adjuntos");
      throw new StepError(`${problems.join(" y ")} (la copia de la base quedó guardada)`);
    }

    // Desde acá el backup está completo: si falla la limpieza, se avisa sin darlo por fallido.
    steps.at("al borrar los backups viejos", "Borrando los backups viejos...");
    let note = "";
    try {
      const now = Date.now();
      const old = (await backupFolders(backups)).filter((folder) => {
        const days = (now - folder.date.getTime()) / 86_400_000;
        return folder.name !== name && (days > retentionDays || (!folder.complete && days > 1));
      });
      await backups.remove(old.flatMap((folder) => folder.pathnames));
    } catch {
      note = ` No se pudieron borrar los backups de más de ${retentionDays} días.`;
      console.error(`AVISO:${note}`);
    }

    const detail = `Base: ${humanSize(dumpBytes.byteLength)}. Adjuntos: ${thousands(files.length)} (${added === 1 ? "1 nuevo" : `${thousands(added)} nuevos`}).${note}`;
    await recordRun("BACKUP", true, name, detail);
    console.log(`Backup completo: ${name}. ${detail}`);
    return 0;
  } catch (error) {
    const reason = steps.reason(error);
    console.error(`Backup FALLIDO: ${reason}`);
    logUnexpected(error);
    await recordRun("BACKUP", false, "", reason);
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

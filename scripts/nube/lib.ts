/**
 * Funciones comunes de los backups de la instalación en Vercel y Neon
 * (scripts/nube/*.ts, que corren en GitHub Actions; ver docs/vercel.md).
 *
 * El log de GitHub Actions de un repositorio público lo puede leer cualquiera:
 * estos scripts nunca muestran datos de la base ni nombres de archivos subidos
 * (las claves del almacén son aleatorias), y tampoco el detalle de los errores
 * de pg_restore, que puede incluir valores de una fila.
 */
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { del, get, list, put } from "@vercel/blob";
import pg from "pg";

// ---------------------------------------------------------------------------
// Variables de entorno
// ---------------------------------------------------------------------------

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new StepError(`falta la variable ${name}`);
  return value;
}

// ---------------------------------------------------------------------------
// Almacenes: Vercel Blob privado o, para las pruebas, una carpeta local
// ---------------------------------------------------------------------------

export type StoreEntry = { pathname: string; size: number };

export interface Store {
  list(prefix: string): Promise<StoreEntry[]>;
  /** El archivo completo, o null si no está. */
  read(pathname: string): Promise<Buffer | null>;
  /** Nunca reemplaza un archivo existente. */
  write(pathname: string, data: Buffer): Promise<void>;
  remove(pathnames: string[]): Promise<void>;
}

export function blobStore(token: string): Store {
  return {
    async list(prefix) {
      const entries: StoreEntry[] = [];
      let cursor: string | undefined;
      do {
        const page = await list({ prefix, cursor, limit: 1000, token });
        entries.push(...page.blobs.map((b) => ({ pathname: b.pathname, size: b.size })));
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      return entries;
    },
    async read(pathname) {
      const result = await get(pathname, { access: "private", token, useCache: false });
      if (!result || result.statusCode !== 200 || !result.stream) return null;
      return Buffer.from(await new Response(result.stream).arrayBuffer());
    },
    async write(pathname, data) {
      await put(pathname, data, {
        access: "private",
        token,
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: "application/octet-stream",
        multipart: data.byteLength > 50 * 1024 * 1024,
      });
    },
    async remove(pathnames) {
      for (let i = 0; i < pathnames.length; i += 100) await del(pathnames.slice(i, i + 100), { token });
    },
  };
}

export function dirStore(dir: string): Store {
  const root = path.resolve(dir);
  const resolve = (pathname: string) => {
    const target = path.resolve(root, pathname);
    if (!target.startsWith(`${root}${path.sep}`)) throw new Error(`Ruta inválida: ${pathname}`);
    return target;
  };
  return {
    async list(prefix) {
      const files = await readdir(root, { recursive: true, withFileTypes: true }).catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return [];
          throw error;
        },
      );
      const entries: StoreEntry[] = [];
      for (const file of files) {
        if (!file.isFile() || file.name.endsWith(".partial")) continue;
        const full = path.join(file.parentPath, file.name);
        const pathname = path.relative(root, full).split(path.sep).join("/");
        if (pathname.startsWith(prefix)) entries.push({ pathname, size: (await stat(full)).size });
      }
      return entries.sort((a, b) => a.pathname.localeCompare(b.pathname));
    },
    async read(pathname) {
      return readFile(resolve(pathname)).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
    },
    async write(pathname, data) {
      const target = resolve(pathname);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, data, { flag: "wx" });
    },
    async remove(pathnames) {
      for (const pathname of pathnames) await rm(resolve(pathname), { force: true });
    },
  };
}

/** Los archivos de la aplicación: su almacén de Vercel Blob o, en las pruebas, STORAGE_DIR. */
export function appStore(): Store {
  const token = process.env.APP_BLOB_TOKEN?.trim();
  if (token) return blobStore(token);
  if (process.env.STORAGE_DIR) return dirStore(process.env.STORAGE_DIR);
  throw new StepError("falta la variable APP_BLOB_TOKEN");
}

/** El almacén de los backups: otro almacén privado de Vercel Blob o, en las pruebas, BACKUP_DIR. */
export function backupStore(): Store {
  const token = process.env.BACKUP_BLOB_TOKEN?.trim();
  if (token) return blobStore(token);
  if (process.env.BACKUP_DIR) return dirStore(process.env.BACKUP_DIR);
  throw new StepError("falta la variable BACKUP_BLOB_TOKEN");
}

/**
 * Cada backup es una carpeta `rrhh-AAAAMMDDTHHMMSSZ/` con `base.dump` y, al
 * final, `SHA256SUMS`: sin ese archivo el backup quedó a medias. Los adjuntos
 * van una sola vez a `archivos/<clave>` (nunca cambian) y los usan todos los
 * backups.
 */
export const DUMP = "base.dump";
export const SUMS = "SHA256SUMS";
export const FILES_PREFIX = "archivos/";
const BACKUP_NAME = /^rrhh-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/;

export function backupName(now = new Date()): string {
  return `rrhh-${now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z")}`;
}

export function backupDate(name: string): Date | null {
  const m = BACKUP_NAME.exec(name);
  return m ? new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!)) : null;
}

export type BackupFolder = { name: string; date: Date; complete: boolean; pathnames: string[] };

/** Las carpetas de backup del almacén, de la más vieja a la más nueva. */
export async function backupFolders(store: Store): Promise<BackupFolder[]> {
  const folders = new Map<string, BackupFolder>();
  for (const entry of await store.list("rrhh-")) {
    const [name, file] = entry.pathname.split("/");
    const date = backupDate(name!);
    if (!date || !file) continue;
    const folder = folders.get(name!) ?? { name: name!, date, complete: false, pathnames: [] };
    folder.pathnames.push(entry.pathname);
    if (file === SUMS) folder.complete = true;
    folders.set(name!, folder);
  }
  return [...folders.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}

// ---------------------------------------------------------------------------
// PostgreSQL
// ---------------------------------------------------------------------------

export async function query<T extends pg.QueryResultRow>(url: string, sql: string, params: unknown[] = []) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return (await client.query<T>(sql, params)).rows;
  } finally {
    await client.end();
  }
}

/** Versión mayor del servidor: pg_dump y pg_restore tienen que ser de la misma. */
export async function serverMajor(url: string): Promise<number> {
  const [row] = await query<{ server_version_num: string }>(url, "SHOW server_version_num");
  return Math.floor(Number(row!.server_version_num) / 10_000);
}

/** Imagen oficial de PostgreSQL de esa versión (trae ICU y las extensiones de contrib). */
export const postgresImage = (major: number) => `postgres:${major}`;

type DockerOptions = { stdin?: string; stdout?: string };

/**
 * Corre `docker` con la entrada y la salida en archivos (o la salida
 * devuelta, si no se indica archivo). Los errores no se muestran (pueden
 * traer datos): se devuelven para decidir qué informar.
 */
export async function docker(
  args: string[],
  options: DockerOptions = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  const child = spawn("docker", args, { stdio: [options.stdin ? "pipe" : "ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stderr!.on("data", (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(-4000);
  });
  const output = options.stdout ? pipeline(child.stdout!, createWriteStream(options.stdout)) : null;
  output?.catch(() => {}); // se espera más abajo
  if (!options.stdout) child.stdout!.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
  // Si el proceso termina sin leer toda la entrada (pg_restore que corta en un
  // error), escribirle falla: decide su código de salida.
  if (options.stdin) pipeline(createReadStream(options.stdin), child.stdin!).catch(() => {});
  const code = await new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (exit) => resolve(exit ?? 1));
  });
  await output;
  return { code, stdout, stderr };
}

/** Un contenedor de PostgreSQL vacío y descartable, para restaurar un backup. */
export async function startScratchPostgres(major: number) {
  const name = `rrhh-restauracion-${randomBytes(4).toString("hex")}`;
  const image = postgresImage(major);
  const started = await docker([
    "run",
    "-d",
    "--rm",
    "--name",
    name,
    "-e",
    `POSTGRES_PASSWORD=${randomBytes(16).toString("hex")}`,
    image,
  ]);
  if (started.code !== 0) throw new StepError(`no arrancó la imagen ${image} (código ${started.code})`);
  // El servidor de inicialización de la imagen no escucha por TCP: esperar a
  // que responda por TCP evita restaurar sobre ese, que se reinicia.
  for (let i = 0; ; i++) {
    const ready = await docker(["exec", name, "pg_isready", "-q", "-h", "127.0.0.1", "-U", "postgres"]);
    if (ready.code === 0) break;
    if (i >= 90) {
      await docker(["rm", "-f", name]);
      throw new StepError("PostgreSQL no arrancó en 90 segundos");
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return {
    name,
    /** Resultado de una consulta, sin encabezados (`psql -At`). */
    async psql(database: string, sql: string): Promise<string> {
      const result = await docker([
        "exec",
        name,
        "psql",
        "-U",
        "postgres",
        "-d",
        database,
        "-v",
        "ON_ERROR_STOP=1",
        "-At",
        "-c",
        sql,
      ]);
      if (result.code !== 0) throw new StepError(`falló una consulta a la base restaurada (código ${result.code})`);
      return result.stdout.trim();
    },
    /** Restaura un dump en una base nueva. Devuelve el código de pg_restore. */
    async restore(database: string, dump: string): Promise<number> {
      await this.psql("postgres", `CREATE DATABASE ${database}`);
      const args = ["exec", "-i", name, "pg_restore", "-U", "postgres", "-d", database];
      return (await docker([...args, ...RESTORE_OPTIONS], { stdin: dump })).code;
    },
    async stop() {
      await docker(["rm", "-f", name]);
    },
  };
}

/**
 * Sin dueños ni permisos del origen (los usuarios de Neon no existen en otro
 * servidor) y cortando ante el primer error.
 */
export const RESTORE_OPTIONS = ["--no-owner", "--no-privileges", "--exit-on-error"];

/** Copia la base con pg_dump (formato custom) a un archivo y verifica que se pueda leer entero. */
export async function dumpDatabase(url: string, major: number, target: string): Promise<void> {
  const image = postgresImage(major);
  // La URL va por el entorno y no en la línea de comandos. Red del host: en las
  // pruebas, la base escucha en localhost.
  process.env.RRHH_DUMP_URL = url;
  try {
    const dump = await docker(
      [
        "run",
        "--rm",
        "--network",
        "host",
        "-e",
        "RRHH_DUMP_URL",
        image,
        "sh",
        "-c",
        'exec pg_dump --format=custom "$RRHH_DUMP_URL"',
      ],
      { stdout: target },
    );
    // El detalle de pg_dump no se muestra: puede traer el servidor o el usuario de la base.
    if (dump.code !== 0) throw new StepError(`pg_dump terminó con código ${dump.code}`);
  } finally {
    delete process.env.RRHH_DUMP_URL;
  }
  // Se lee entero (con --list alcanzaría el índice, que está al principio).
  const check = await docker(["run", "--rm", "-i", image, "pg_restore", "--file=/dev/null"], { stdin: target });
  if (check.code !== 0) throw new StepError("el dump no se puede leer completo");
}

// ---------------------------------------------------------------------------
// Registro para el aviso del inicio (tabla backup_run)
// ---------------------------------------------------------------------------

export type RunKind = "BACKUP" | "PRUEBA_RESTAURACION";

let recorded = false;

/**
 * Registra el resultado en la base de la aplicación. Si no puede, lo avisa y
 * sigue: sin registros nuevos, el inicio muestra el backup como atrasado.
 */
export async function recordRun(kind: RunKind, ok: boolean, name: string | null, detail: string | null) {
  // Una vez por corrida: si la interrumpen mientras termina, vale lo primero.
  if (recorded) return;
  recorded = true;
  try {
    await query(
      requireEnv("DIRECT_URL"),
      `INSERT INTO backup_run (id, kind, ok, name, detail) VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
      [kind, ok, name || null, detail || null],
    );
  } catch {
    console.error(
      "AVISO: no se pudo registrar el resultado en la base; el inicio de la aplicación no lo va a mostrar.",
    );
  }
}

// ---------------------------------------------------------------------------
// Pasos y errores
// ---------------------------------------------------------------------------

/** Error con un motivo que se puede mostrar y registrar (sin datos de la base). */
export class StepError extends Error {}

/**
 * Muestra un error inesperado. En GitHub Actions, solo su tipo y su código: el
 * repositorio y sus registros son públicos, y el mensaje de un error de
 * conexión puede traer el servidor o el usuario de la base.
 */
export function logUnexpected(error: unknown) {
  if (error instanceof StepError) return;
  if (process.env.GITHUB_ACTIONS !== "true") {
    console.error(error);
    return;
  }
  const name = error instanceof Error ? error.name : typeof error;
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  console.error(`Tipo de error: ${name}${code ? ` (código ${code})` : ""}. El mensaje no se muestra en este registro.`);
}

/**
 * Lo que se está haciendo, para el motivo de un error: "Error al copiar la
 * base de datos." De un error inesperado se registra solo el paso, sin su
 * mensaje, que podría traer datos.
 */
export class Steps {
  current = "al preparar";
  at(step: string, progress?: string) {
    this.current = step;
    if (progress) console.log(progress);
  }
  reason(error: unknown): string {
    const base = `Error ${this.current}`;
    return error instanceof StepError ? `${base}: ${error.message}.` : `${base}.`;
  }
  interrupted(): string {
    return `Se interrumpió ${this.current}.`;
  }
}

/**
 * Si GitHub cancela la tarea o se le acaba el tiempo, manda SIGINT y después
 * SIGTERM: se corre `cleanup` (registrar el resultado, parar el contenedor,
 * borrar el temporal) y se termina.
 */
export function onInterrupt(cleanup: () => Promise<void>) {
  let stopping = false;
  const handler = (signal: NodeJS.Signals) => {
    if (stopping) return;
    stopping = true;
    cleanup()
      .catch(() => {})
      .finally(() => process.exit(signal === "SIGINT" ? 130 : 143));
  };
  process.on("SIGINT", handler);
  process.on("SIGTERM", handler);
}

/** Carpeta temporal del proceso (se borra al terminar). */
let temp: string | undefined;
export async function tempDir(): Promise<string> {
  if (!temp) {
    temp = path.join(process.env.RUNNER_TEMP ?? "/tmp", `rrhh-${process.pid}`);
    await mkdir(temp, { recursive: true, mode: 0o700 });
  }
  return temp;
}
export async function removeTempDir() {
  if (temp) await rm(temp, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------

export const sha256 = (data: Buffer) => createHash("sha256").update(data).digest("hex");

/** 15230 → "15.230". */
export const thousands = (n: number) => n.toLocaleString("es-AR", { useGrouping: true, maximumFractionDigits: 0 });

/** "1 archivo" / "3 archivos" / "15.230 filas". */
export const plural = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${thousands(n)} ${many}`);

/** "136 KB", "48,3 MB", "1,2 GB". */
export function humanSize(bytes: number): string {
  const kb = Math.max(1, Math.round(bytes / 1024));
  if (kb < 1024) return `${kb} KB`;
  const format = (n: number) => n.toFixed(1).replace(".", ",");
  return kb < 1024 * 1024 ? `${format(kb / 1024)} MB` : `${format(kb / (1024 * 1024))} GB`;
}

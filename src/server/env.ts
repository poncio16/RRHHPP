import "server-only";
import { z } from "@/lib/zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url({ error: "DATABASE_URL debe ser una URL de conexión válida" }),
  APP_URL: z.url({ error: "APP_URL debe ser una URL válida" }),
  /** Dónde se guardan los archivos: disco local (Docker) o un almacén privado de Vercel Blob. */
  STORAGE_DRIVER: z.enum(["local", "vercel-blob"]).default("local"),
  STORAGE_DIR: z.string().min(1).default("./storage"),
  /**
   * "true" si la app corre detrás de un proxy inverso que informa la IP real
   * del cliente. En Vercel lo es siempre (su red pone `X-Real-IP`).
   */
  TRUSTED_PROXY: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export type Env = z.infer<typeof envSchema>;

/**
 * En Vercel, la URL de producción y el proxy de confianza salen de sus propias
 * variables si no se definieron a mano.
 */
function withVercelDefaults(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (source.VERCEL !== "1") return source;
  const host = source.VERCEL_PROJECT_PRODUCTION_URL;
  return {
    ...source,
    APP_URL: source.APP_URL || (host ? `https://${host}` : undefined),
    TRUSTED_PROXY: source.TRUSTED_PROXY || "true",
  };
}

function loadEnv(): Env {
  const parsed = envSchema.safeParse(withVercelDefaults(process.env));
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `- ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(
      `Variables de entorno inválidas o faltantes:\n${detail}\nRevisá el archivo .env (ver .env.example; en producción, .env.production.example).`,
    );
  }
  return parsed.data;
}

export const env = loadEnv();

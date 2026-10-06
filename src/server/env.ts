import "server-only";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url({ error: "DATABASE_URL debe ser una URL de conexión válida" }),
  APP_URL: z.url({ error: "APP_URL debe ser una URL válida" }),
  STORAGE_DIR: z.string().min(1).default("./storage"),
  /** "true" si la app corre detrás de un proxy inverso que informa la IP real del cliente. */
  TRUSTED_PROXY: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `- ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(
      `Variables de entorno inválidas o faltantes:\n${detail}\nRevisá el archivo .env (ver .env.example).`,
    );
  }
  return parsed.data;
}

export const env = loadEnv();

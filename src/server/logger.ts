import "server-only";
import pino from "pino";
import { env } from "./env";

/**
 * Logs técnicos estructurados (JSON). La auditoría de negocio va a audit_log, no acá.
 * Nunca loguear contraseñas, tokens de sesión ni CBU completos.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  base: undefined,
  redact: {
    paths: ["password", "*.password", "passwordHash", "*.passwordHash", "token", "*.token", "cbu", "*.cbu"],
    censor: "[oculto]",
  },
});

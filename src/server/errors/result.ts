import "server-only";
import { randomUUID } from "node:crypto";
import { logger } from "../logger";
import type { ErrorCode, FieldErrors } from "./app-error";
import { toAppError } from "./to-app-error";

/** Respuesta uniforme de las server actions. */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string; fieldErrors?: FieldErrors; reference?: string } };

export function errorResult(error: unknown): Extract<ActionResult<never>, { ok: false }> {
  const appError = toAppError(error);
  if (appError) {
    const fieldErrors = "fieldErrors" in appError ? (appError.fieldErrors as FieldErrors) : undefined;
    return { ok: false, error: { code: appError.code, message: appError.message, fieldErrors } };
  }
  const reference = randomUUID().slice(0, 8);
  logger.error({ err: error, reference }, "Error inesperado");
  return {
    ok: false,
    error: {
      code: "INTERNAL",
      message: `Ocurrió un error inesperado. Si persiste, informá el código ${reference}.`,
      reference,
    },
  };
}

/** Ejecuta la operación y convierte cualquier error en ActionResult. */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    return errorResult(error);
  }
}

/** Versión para route handlers: el mismo cuerpo con el código HTTP correspondiente. */
export function errorResponse(error: unknown): Response {
  const result = errorResult(error);
  const status = toAppError(error)?.httpStatus ?? 500;
  return Response.json(result, { status });
}

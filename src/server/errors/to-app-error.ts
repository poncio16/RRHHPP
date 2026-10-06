import { ZodError } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { AppError, ConflictError, NotFoundError, ValidationError, type FieldErrors } from "./app-error";

/** Mensajes para restricciones únicas conocidas, por nombre de campo. */
const UNIQUE_MESSAGES: Record<string, string> = {
  dni: "Ya existe un empleado con ese DNI.",
  cuil: "Ya existe un empleado con ese CUIL.",
  file_number: "Ya existe un empleado con ese número de legajo.",
  email: "Ya existe un registro con ese email.",
  name: "Ya existe un registro con ese nombre.",
  code: "Ya existe un registro con ese código.",
};

export function zodToFieldErrors(error: ZodError): FieldErrors {
  const fieldErrors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fieldErrors;
}

/**
 * Traduce errores conocidos (Zod, Prisma) a AppError.
 * Devuelve null si el error es inesperado: el llamador lo registra y responde genérico.
 */
export function toAppError(error: unknown): AppError | null {
  if (error instanceof AppError) return error;

  if (error instanceof ZodError) {
    return new ValidationError(undefined, zodToFieldErrors(error));
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      const fields = uniqueFields(error);
      const field = fields.find((f) => f in UNIQUE_MESSAGES);
      const message = field ? UNIQUE_MESSAGES[field]! : "Ya existe un registro con esos datos.";
      return new ConflictError(message, field ? { [camelCase(field)]: [message] } : {});
    }
    if (error.code === "P2025") return new NotFoundError();
    if (error.code === "P2003") {
      return new ConflictError("La operación no es posible porque el registro está relacionado con otros datos.");
    }
  }

  return null;
}

type UniqueMeta = {
  target?: unknown;
  driverAdapterError?: { cause?: { table?: string; constraint?: { fields?: unknown; index?: string } } };
};

/** Campos de la restricción única violada (según el formato que informe el driver). */
function uniqueFields(error: Prisma.PrismaClientKnownRequestError): string[] {
  const meta = error.meta as UniqueMeta | undefined;
  const cause = meta?.driverAdapterError?.cause;
  const target = meta?.target ?? cause?.constraint?.fields;
  if (Array.isArray(target)) return target.map((t) => String(t).replaceAll('"', ""));
  if (typeof target === "string") return [target];

  // Nombre del índice: "<tabla>_<columna>_key" (convención de Prisma).
  const index = cause?.constraint?.index;
  if (index && cause?.table && index.startsWith(`${cause.table}_`) && index.endsWith("_key")) {
    return [index.slice(cause.table.length + 1, -"_key".length)];
  }
  return [];
}

function camelCase(snake: string): string {
  return snake.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

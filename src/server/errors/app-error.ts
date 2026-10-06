/**
 * Errores de dominio. Los servicios lanzan estas clases; los adaptadores
 * (server actions y route handlers) las traducen a respuestas.
 */

export type FieldErrors = Record<string, string[]>;

export type ErrorCode =
  "VALIDATION" | "NOT_FOUND" | "UNAUTHORIZED" | "FORBIDDEN" | "CONFLICT" | "BUSINESS_RULE" | "INTERNAL";

export abstract class AppError extends Error {
  abstract readonly code: ErrorCode;
  abstract readonly httpStatus: number;
}

export class ValidationError extends AppError {
  readonly code = "VALIDATION";
  readonly httpStatus = 400;
  constructor(
    message = "Hay datos inválidos. Revisá los campos marcados.",
    readonly fieldErrors: FieldErrors = {},
  ) {
    super(message);
  }
}

export class NotFoundError extends AppError {
  readonly code = "NOT_FOUND";
  readonly httpStatus = 404;
  constructor(message = "El registro no existe o fue eliminado.") {
    super(message);
  }
}

export class UnauthorizedError extends AppError {
  readonly code = "UNAUTHORIZED";
  readonly httpStatus = 401;
  constructor(message = "Tu sesión expiró. Volvé a iniciar sesión.") {
    super(message);
  }
}

export class ForbiddenError extends AppError {
  readonly code = "FORBIDDEN";
  readonly httpStatus = 403;
  constructor(message = "No tenés permiso para realizar esta operación.") {
    super(message);
  }
}

export class ConflictError extends AppError {
  readonly code = "CONFLICT";
  readonly httpStatus = 409;
  constructor(
    message: string,
    readonly fieldErrors: FieldErrors = {},
  ) {
    super(message);
  }
}

export class BusinessRuleError extends AppError {
  readonly code = "BUSINESS_RULE";
  readonly httpStatus = 422;
}

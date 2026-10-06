import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import type { ActionResult } from "@/server/errors/result";

type ActionError = Extract<ActionResult<unknown>, { ok: false }>["error"];

/**
 * Lleva los errores por campo devueltos por el servidor al formulario.
 * Devuelve el mensaje general para mostrarlo arriba del formulario.
 */
export function applyActionErrors<T extends FieldValues>(error: ActionError, setError: UseFormSetError<T>): string {
  for (const [field, messages] of Object.entries(error.fieldErrors ?? {})) {
    if (messages[0]) setError(field as Path<T>, { type: "server", message: messages[0] });
  }
  return error.message;
}

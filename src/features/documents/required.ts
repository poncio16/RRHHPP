/**
 * Documentos obligatorios (funciones puras): qué tipos marcados como
 * obligatorios en el catálogo le faltan a un legajo. Cuenta como cargado
 * cualquier documento del tipo que no esté anulado, aunque esté pendiente,
 * observado o vencido: esos casos ya tienen su propio aviso.
 */

export type RequiredType = { id: string; name: string };

/** Tipos obligatorios sin ningún documento cargado, en el orden recibido. */
export function missingRequired(required: readonly RequiredType[], loadedTypeIds: Iterable<string>): RequiredType[] {
  const loaded = new Set(loadedTypeIds);
  return required.filter((type) => !loaded.has(type.id));
}

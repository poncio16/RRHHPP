/** Enlace a la misma ruta cambiando algunos parámetros (null quita el parámetro) y volviendo a la primera página. */
export function hrefWith(pathname: string, params: Record<string, string>, changes: Record<string, string | null>) {
  const next = new URLSearchParams(params);
  next.delete("page");
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) next.delete(key);
    else next.set(key, value);
  }
  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}

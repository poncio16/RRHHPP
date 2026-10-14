"use client";

/**
 * Al imprimir una página del grupo `(print)` sale solo su `<main>`: se ocultan
 * los avisos y anuncios que la aplicación agrega al final de la página (si no,
 * salen en una hoja en blanco). Next conserva ocultas las páginas que se
 * dejaron, así que la regla se desactiva cuando esta deja de verse y no afecta
 * la impresión de las demás.
 */
export function PrintOnlyMain() {
  return (
    <style
      ref={(style) => {
        if (style) style.media = "";
        return () => {
          if (style) style.media = "not all";
        };
      }}
    >
      {"@media print { body > :not(main) { display: none !important; } }"}
    </style>
  );
}

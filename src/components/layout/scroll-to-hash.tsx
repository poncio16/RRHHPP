"use client";

import { useEffect } from "react";

/**
 * Lleva al elemento del ancla de la URL (por ejemplo, #backups) cuando ya está
 * en la página. Va dentro del contenido que llega en un `<Suspense>`: cuando el
 * navegador o el router buscan el ancla, ese contenido todavía no está.
 */
export function ScrollToHash() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);
  return null;
}

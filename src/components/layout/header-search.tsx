"use client";

import { Search } from "lucide-react";
import Form from "next/form";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";

/** Búsqueda rápida de empleados desde el encabezado: abre el listado filtrado. */
export function HeaderSearch() {
  const pathname = usePathname();
  const input = useRef<HTMLInputElement>(null);
  // En el listado ya hay un buscador; no se duplica.
  if (pathname === "/empleados") return <div className="flex-1" />;

  return (
    <>
      <Form
        action="/empleados"
        role="search"
        className="hidden min-w-0 flex-1 sm:flex"
        onSubmit={() => setTimeout(() => input.current && (input.current.value = ""), 0)}
      >
        <label className="relative w-full max-w-sm">
          <span className="sr-only">Buscar empleado</span>
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <input
            ref={input}
            name="q"
            type="search"
            required
            autoComplete="off"
            placeholder="Buscar empleado…"
            className="bg-background focus-visible:ring-ring h-9 w-full rounded-md border pr-3 pl-8 text-sm outline-none focus-visible:ring-2"
          />
        </label>
      </Form>
      <div className="flex-1 sm:hidden" />
      <Link href="/empleados" aria-label="Buscar empleado" className="hover:bg-accent rounded-md p-2 sm:hidden">
        <Search className="size-5" />
      </Link>
    </>
  );
}

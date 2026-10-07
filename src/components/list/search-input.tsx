"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";

/** Búsqueda que actualiza `?q=` en la URL (con espera de 300 ms) y vuelve a la página 1. */
export function SearchInput({ placeholder = "Buscar…" }: { placeholder?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");
  const [, startTransition] = useTransition();
  const urlQuery = params.get("q") ?? "";
  const lastUrlQuery = useRef(urlQuery);

  // Si la URL cambia desde afuera (por ejemplo, la búsqueda de la barra superior), se refleja acá.
  useEffect(() => {
    if (urlQuery !== lastUrlQuery.current) {
      lastUrlQuery.current = urlQuery;
      setValue(urlQuery);
    }
  }, [urlQuery]);

  useEffect(() => {
    const current = params.get("q") ?? "";
    if (value.trim() === current) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (value.trim()) next.set("q", value.trim());
      else next.delete("q");
      next.delete("page");
      lastUrlQuery.current = value.trim();
      startTransition(() => router.replace(`${pathname}?${next.toString()}`));
    }, 300);
    return () => clearTimeout(timer);
  }, [value, params, pathname, router]);

  return (
    <div className="relative w-full sm:max-w-xs">
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
      <Input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="pl-8"
      />
    </div>
  );
}

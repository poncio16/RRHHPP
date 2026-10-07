"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Input } from "@/components/ui/input";

/** Fecha de filtro que se guarda en la URL (`name=AAAA-MM-DD`). Vacía quita el filtro. */
export function DateFilter({ name, label }: { name: string; label: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  return (
    <label className="text-muted-foreground flex items-center gap-2 text-sm">
      <span className="shrink-0">{label}</span>
      <Input
        type="date"
        className="w-full sm:w-auto"
        defaultValue={params.get(name) ?? ""}
        key={params.get(name) ?? ""}
        disabled={pending}
        onChange={(e) => {
          const value = e.target.value;
          // Mientras se escribe a mano la fecha queda incompleta: se espera a que sea válida o vacía.
          if (value !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
          const next = new URLSearchParams(params);
          if (value) next.set(name, value);
          else next.delete(name);
          next.delete("page");
          startTransition(() => router.replace(`${pathname}?${next.toString()}`));
        }}
      />
    </label>
  );
}

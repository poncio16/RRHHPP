"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Select } from "@/components/ui/select";

/** Filtro que guarda su valor en la URL. La opción con valor "" quita el filtro. */
export function FilterSelect({
  name,
  label,
  options,
  defaultValue = "",
}: {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  return (
    <Select
      aria-label={label}
      className="w-full sm:w-auto"
      value={params.get(name) ?? defaultValue}
      disabled={pending}
      onChange={(e) => {
        const next = new URLSearchParams(params);
        if (e.target.value) next.set(name, e.target.value);
        else next.delete(name);
        next.delete("page");
        startTransition(() => router.replace(`${pathname}?${next.toString()}`));
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}

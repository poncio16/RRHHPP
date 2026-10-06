import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Select nativo: accesible, funciona con teclado y en móvil abre el selector del sistema. */
export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "border-input bg-card focus-visible:border-ring focus-visible:ring-ring/30 aria-invalid:border-destructive flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

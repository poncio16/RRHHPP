"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Abre el diálogo de impresión del navegador. */
export function PrintButton({ label = "Imprimir" }: { label?: string }) {
  return (
    <Button type="button" onClick={() => window.print()}>
      <Printer /> {label}
    </Button>
  );
}

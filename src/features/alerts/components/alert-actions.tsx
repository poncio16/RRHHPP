"use client";

import { BellOff, Clock, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { changeAlertStateAction } from "../actions";
import { SNOOZE_DAYS } from "../constants";

/** Posponer o descartar una alerta pendiente; volver a mostrar una pospuesta o descartada. */
export function AlertActions({ alertKey, state }: { alertKey: string; state: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (action: "posponer" | "descartar" | "restaurar", message: string) =>
    startTransition(async () => {
      const result = await changeAlertStateAction({ key: alertKey, action });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(message);
      router.refresh();
    });

  if (state !== "pendientes") {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => run("restaurar", "La alerta vuelve a pendientes")}
      >
        <RotateCcw /> Volver a pendientes
      </Button>
    );
  }
  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => run("posponer", `Alerta pospuesta ${SNOOZE_DAYS} días`)}
      >
        <Clock /> Posponer {SNOOZE_DAYS} días
      </Button>
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => run("descartar", "Alerta descartada")}>
        <BellOff /> Descartar
      </Button>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
import { setScheduleActiveAction } from "../actions";

export function ScheduleActiveToggle({ id, name, isActive }: { id: string; name: string; isActive: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (!isActive) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await setScheduleActiveAction(id, true);
            if (!result.ok) toast.error(result.error.message);
            else {
              toast.success("Horario reactivado");
              router.refresh();
            }
          })
        }
      >
        Reactivar
      </Button>
    );
  }

  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline" size="sm">
          Desactivar
        </Button>
      }
      title="Desactivar horario"
      description={`"${name}" deja de ofrecerse al cargar legajos. Los empleados que ya lo tienen no cambian.`}
      confirmLabel="Desactivar"
      onConfirm={async () => {
        const result = await setScheduleActiveAction(id, false);
        if (!result.ok) return result.error.message;
        toast.success("Horario desactivado");
        router.refresh();
      }}
    />
  );
}

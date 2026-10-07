"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
import { deleteHolidayAction } from "../actions";

export function DeleteHolidayButton({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="icon" aria-label={`Quitar ${label}`}>
          <Trash2 />
        </Button>
      }
      title="Quitar feriado"
      description={`Se quita "${label}" del calendario. Queda registrado en la auditoría.`}
      confirmLabel="Quitar"
      destructive
      onConfirm={async () => {
        const result = await deleteHolidayAction(id);
        if (!result.ok) return result.error.message;
        toast.success("Feriado quitado");
        router.refresh();
      }}
    />
  );
}

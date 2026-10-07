"use client";

import { CheckCheck, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
import { bulkNoveltyAction } from "../actions";

type Filter = { periodo: string; q?: string; estado: string; tipo?: string; origen?: string; sector?: string };

/**
 * Aprobar todas las pendientes o marcar como informadas todas las aprobadas
 * del filtro actual (siempre dentro del período que se está viendo).
 */
export function BulkNoveltyButtons({
  filter,
  label,
  pending,
  approved,
  canWrite,
  canReport,
}: {
  filter: Filter;
  label: string;
  pending: number;
  approved: number;
  canWrite: boolean;
  canReport: boolean;
}) {
  const router = useRouter();
  const run = async (action: "aprobar" | "informar") => {
    const result = await bulkNoveltyAction({ ...filter, action });
    if (!result.ok) return result.error.message;
    const n = result.data.changed;
    toast.success(
      action === "aprobar"
        ? n === 1
          ? "Se aprobó 1 novedad"
          : `Se aprobaron ${n} novedades`
        : n === 1
          ? "Se marcó 1 novedad como informada"
          : `Se marcaron ${n} novedades como informadas`,
    );
    router.refresh();
  };
  const plural = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

  return (
    <div className="flex flex-wrap gap-2">
      {canWrite && pending > 0 && (
        <ConfirmDialog
          trigger={
            <Button variant="outline" size="sm">
              <CheckCheck /> Aprobar pendientes ({pending})
            </Button>
          }
          title="Aprobar pendientes"
          description={`Se aprueban ${plural(pending, "novedad pendiente", "novedades pendientes")} de ${label} que coinciden con los filtros.`}
          confirmLabel="Aprobar"
          onConfirm={() => run("aprobar")}
        />
      )}
      {canReport && approved > 0 && (
        <ConfirmDialog
          trigger={
            <Button variant="outline" size="sm">
              <Send /> Marcar informadas ({approved})
            </Button>
          }
          title="Marcar como informadas"
          description={`${plural(approved, "novedad aprobada", "novedades aprobadas")} de ${label} ${approved === 1 ? "queda" : "quedan"} como informadas al sistema de liquidación. Hacelo después de cargarlas allí.`}
          confirmLabel="Marcar informadas"
          onConfirm={() => run("informar")}
        />
      )}
    </div>
  );
}

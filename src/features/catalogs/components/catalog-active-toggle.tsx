"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
import { setCatalogItemActiveAction } from "../actions";
import { CATALOGS, type CatalogKey } from "../definitions";

/** Desactivar pide confirmación; reactivar es directo. */
export function CatalogActiveToggle({
  catalog,
  item,
}: {
  catalog: CatalogKey;
  item: { id: string; label: string; isActive: boolean };
}) {
  const def = CATALOGS[catalog];
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (!item.isActive) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await setCatalogItemActiveAction(catalog, item.id, true);
            if (!result.ok) toast.error(result.error.message);
            else {
              toast.success("Elemento reactivado");
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
      title={`Desactivar ${def.singular}`}
      description={`"${item.label}" deja de ofrecerse al cargar datos nuevos. Los registros que ya lo usan no cambian y se puede reactivar cuando quieras.`}
      confirmLabel="Desactivar"
      onConfirm={async () => {
        const result = await setCatalogItemActiveAction(catalog, item.id, false);
        if (!result.ok) return result.error.message;
        toast.success("Elemento desactivado");
        router.refresh();
      }}
    />
  );
}

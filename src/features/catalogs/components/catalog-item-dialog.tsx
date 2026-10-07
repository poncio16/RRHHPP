"use client";

import { Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createCatalogItemAction, updateCatalogItemAction } from "../actions";
import { CATALOGS, type CatalogKey } from "../definitions";
import { CatalogItemForm, type CatalogOption } from "./catalog-item-form";

/** Botón que abre el alta (sin `item`) o la edición de un elemento del catálogo. */
export function CatalogItemDialog({
  catalog,
  options,
  item,
}: {
  catalog: CatalogKey;
  options: Record<string, CatalogOption[]>;
  item?: { id: string; label: string; formValues: Record<string, string | boolean> };
}) {
  const def = CATALOGS[catalog];
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const mode = item ? "update" : "create";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {item ? (
          <Button variant="ghost" size="icon" aria-label={`Editar ${item.label}`}>
            <Pencil />
          </Button>
        ) : (
          <Button>
            <Plus /> Nuevo {def.singular}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? `Editar ${def.singular}` : `Nuevo ${def.singular}`}</DialogTitle>
          <DialogDescription>{def.description}</DialogDescription>
        </DialogHeader>
        <CatalogItemForm
          catalog={catalog}
          mode={mode}
          defaultValues={item?.formValues}
          options={options}
          onCancel={() => setOpen(false)}
          onSubmit={async (values) => {
            const result = item
              ? await updateCatalogItemAction(catalog, item.id, values)
              : await createCatalogItemAction(catalog, values);
            if (result.ok) {
              setOpen(false);
              toast.success(item ? "Cambios guardados" : "Elemento creado");
              router.refresh();
            }
            return result;
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

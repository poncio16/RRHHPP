"use client";

import { Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
import { confirmImportAction, discardImportAction } from "../actions";

/**
 * Confirmar (crea los legajos de las filas válidas y los valores nuevos de
 * Catálogos) o descartar el lote. `blocked`: quien mira no puede confirmarlo.
 */
export function JobActions({
  id,
  valid,
  skipped,
  newItems,
  blocked = false,
}: {
  id: string;
  valid: number;
  skipped: number;
  newItems: number;
  blocked?: boolean;
}) {
  const router = useRouter();
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  return (
    <div className="flex flex-wrap gap-2">
      <ConfirmDialog
        trigger={
          <Button disabled={valid === 0 || blocked}>
            <Check />
            Importar {plural(valid, "legajo", "legajos")}
          </Button>
        }
        title="Confirmar la importación"
        description={
          <>
            <p>
              {newItems > 0
                ? `Se van a dar de alta ${plural(valid, "legajo nuevo", "legajos nuevos")} y ${plural(newItems, "valor nuevo", "valores nuevos")} en Catálogos, todo junto o nada.`
                : `Se van a dar de alta ${plural(valid, "legajo nuevo", "legajos nuevos")}, todos juntos o ninguno.`}
            </p>
            {skipped > 0 && (
              <p className="mt-2">
                {plural(
                  skipped,
                  "fila con errores o duplicada no se importa",
                  "filas con errores o duplicadas no se importan",
                )}
                . Ningún legajo existente se modifica.
              </p>
            )}
          </>
        }
        confirmLabel="Importar"
        onConfirm={async () => {
          const result = await confirmImportAction(id);
          if (!result.ok) return result.error.message;
          const { created, catalogItems } = result.data;
          toast.success(
            `Se ${created === 1 ? "creó 1 legajo" : `crearon ${created} legajos`}${
              catalogItems > 0 ? ` y ${plural(catalogItems, "valor nuevo", "valores nuevos")} en Catálogos` : ""
            }`,
          );
          router.refresh();
        }}
      />
      <ConfirmDialog
        trigger={
          <Button variant="outline">
            <X />
            Descartar
          </Button>
        }
        title="Descartar la importación"
        description="No se crea ningún legajo. Si corregiste el archivo, subilo de nuevo desde Importar."
        confirmLabel="Descartar"
        destructive
        onConfirm={async () => {
          const result = await discardImportAction(id);
          if (!result.ok) return result.error.message;
          toast.success("Importación descartada");
          router.refresh();
        }}
      />
    </div>
  );
}

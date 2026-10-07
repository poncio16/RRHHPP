"use client";

import { Ban, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { DocumentDialog, type DocumentTypeChoice } from "@/features/documents/components/document-dialog";
import { formatDate } from "@/lib/format";
import { annulExitAction, confirmExitAction } from "../actions";
import type { ExitItem, ExitOption } from "../service";
import { ExitDialog, showExitWarnings } from "./exit-dialog";

export type ExitEditOptions = {
  types: ExitOption[];
  reasons: ExitOption[];
  today: string;
  /** Para adjuntar documentos; sin permiso de documentación no se ofrece. */
  documents: { types: DocumentTypeChoice[]; limits: { maxFileSizeMb: number; typesLabel: string } } | null;
};

/** Acciones de un egreso según su estado. */
export function ExitActions({ item, title, edit }: { item: ExitItem; title: string; edit: ExitEditOptions }) {
  const router = useRouter();
  const exitIso = item.formValues.exitDate;
  const due = exitIso <= edit.today;

  return (
    <div className="flex justify-end gap-1">
      {item.status === "EN_TRAMITE" && (
        <ConfirmDialog
          trigger={
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Confirmar ${title}`}
              title={due ? "Confirmar egreso" : `Se confirma a partir del ${formatDate(item.exitDate)}`}
              disabled={!due}
            >
              <CheckCircle2 />
            </Button>
          }
          title="Confirmar egreso"
          description={`${title}. El empleado pasa a egresado desde el ${formatDate(item.exitDate)}. El legajo y su historial se conservan; si hay licencias, asistencia, básicos, resúmenes o novedades posteriores a esa fecha, primero hay que corregirlos.`}
          confirmLabel="Confirmar egreso"
          destructive
          onConfirm={async () => {
            const result = await confirmExitAction(item.id, { version: item.version });
            if (!result.ok) return result.error.message;
            toast.success("Egreso confirmado: el empleado figura como egresado");
            showExitWarnings(result.data.warnings);
            router.refresh();
          }}
        />
      )}
      {edit.documents && item.status !== "ANULADO" && (
        <DocumentDialog
          employeeId={item.employee.id}
          types={edit.documents.types}
          limits={edit.documents.limits}
          exit={{ id: item.id, label: title }}
        />
      )}
      {item.editable && (
        <ExitDialog
          employeeId={item.employee.id}
          types={edit.types}
          reasons={edit.reasons}
          today={edit.today}
          record={{
            id: item.id,
            version: item.version,
            title,
            confirmed: item.status === "CONFIRMADO",
            values: item.formValues,
          }}
        />
      )}
      {item.annullable && (
        <AnnulExitButton id={item.id} version={item.version} title={title} confirmed={item.status === "CONFIRMADO"} />
      )}
    </div>
  );
}

/** Anulación con motivo. Si el egreso estaba confirmado, el empleado vuelve a activo. */
function AnnulExitButton({
  id,
  version,
  title,
  confirmed,
}: {
  id: string;
  version: string;
  title: string;
  confirmed: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const fieldId = `annul-exit-${id}`;

  const confirm = () =>
    startTransition(async () => {
      const result = await annulExitAction(id, { version, reason });
      if (!result.ok) {
        setError(result.error.fieldErrors?.reason?.[0] ?? result.error.message);
        return;
      }
      toast.success(confirmed ? "Egreso anulado: el empleado vuelve a activo" : "Egreso anulado");
      setOpen(false);
      router.refresh();
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        setReason("");
        setError(undefined);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Anular ${title}`} title="Anular">
          <Ban />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Anular egreso</DialogTitle>
          <DialogDescription>
            {title}. No se borra: queda como anulado, con el motivo en las observaciones.
            {confirmed && " El empleado vuelve a figurar como activo."}
          </DialogDescription>
        </DialogHeader>
        <FormField id={fieldId} label="Motivo" error={error} required>
          <Textarea
            id={fieldId}
            rows={3}
            value={reason}
            aria-invalid={!!error}
            aria-describedby={error ? `${fieldId}-error` : undefined}
            onChange={(e) => setReason(e.target.value)}
          />
        </FormField>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={pending}>
            {pending ? "Anulando…" : "Anular"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

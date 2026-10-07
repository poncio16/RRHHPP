"use client";

import { Ban, Check, Send, Undo2 } from "lucide-react";
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
import { annulNoveltyAction, approveNoveltyAction, reportNoveltyAction, unreportNoveltyAction } from "../actions";
import type { NoveltyItem, NoveltyTypeOption } from "../service";
import { NoveltyDialog } from "./novelty-dialog";

/** Acciones de una novedad según su estado y los permisos de quien la ve. */
export function NoveltyActions({
  item,
  title,
  canWrite,
  canReport,
  types,
}: {
  item: NoveltyItem;
  title: string;
  canWrite: boolean;
  canReport: boolean;
  types: NoveltyTypeOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = (
    action: () => Promise<{ ok: true; data: { status: string } } | { ok: false; error: { message: string } }>,
  ) =>
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(`Novedad ${result.data.status.toLowerCase()}`);
      router.refresh();
    });

  return (
    <div className="flex justify-end gap-1">
      {canWrite && item.status === "PENDIENTE" && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Aprobar ${title}`}
          title="Aprobar"
          disabled={pending}
          onClick={() => run(() => approveNoveltyAction(item.id))}
        >
          <Check />
        </Button>
      )}
      {canReport && item.status === "APROBADA" && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Marcar como informada ${title}`}
          title="Marcar como informada"
          disabled={pending}
          onClick={() => run(() => reportNoveltyAction(item.id))}
        >
          <Send />
        </Button>
      )}
      {canReport && item.status === "INFORMADA" && (
        <ConfirmDialog
          trigger={
            <Button variant="ghost" size="icon" aria-label={`Desmarcar como informada ${title}`} title="Desmarcar">
              <Undo2 />
            </Button>
          }
          title="Desmarcar como informada"
          description={`${title}. Vuelve a aprobada, por ejemplo si se marcó por error o no llegó a cargarse en la liquidación.`}
          confirmLabel="Desmarcar"
          onConfirm={async () => {
            const result = await unreportNoveltyAction(item.id);
            if (!result.ok) return result.error.message;
            toast.success("La novedad volvió a aprobada");
            router.refresh();
          }}
        />
      )}
      {canWrite && item.editable && (
        <NoveltyDialog
          employeeId={item.employee.id}
          types={types}
          defaultDate={item.formValues.date}
          defaultPeriod={item.formValues.period}
          record={{ id: item.id, version: item.version, title, status: item.status, values: item.formValues }}
        />
      )}
      {canWrite && (item.status === "PENDIENTE" || item.status === "APROBADA") && (
        <AnnulNoveltyButton id={item.id} version={item.version} title={title} />
      )}
    </div>
  );
}

/** Anulación con motivo obligatorio. La novedad se conserva como anulada. */
function AnnulNoveltyButton({ id, version, title }: { id: string; version: string; title: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const fieldId = `annul-novelty-${id}`;

  const confirm = () =>
    startTransition(async () => {
      const result = await annulNoveltyAction(id, { version, reason });
      if (!result.ok) {
        setError(result.error.fieldErrors?.reason?.[0] ?? result.error.message);
        return;
      }
      toast.success("Novedad anulada");
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
          <DialogTitle>Anular novedad</DialogTitle>
          <DialogDescription>
            {title}. No se borra: queda como anulada, con el motivo en las observaciones. Si era generada, no se vuelve
            a crear al generar el período.
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

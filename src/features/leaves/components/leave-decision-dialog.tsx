"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/forms/form-field";
import { Alert } from "@/components/ui/alert";
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
import { decideLeaveAction } from "../actions";

/** Aprobación o rechazo de una solicitud. El rechazo pide motivo. */
export function LeaveDecisionDialog({
  id,
  version,
  title,
  summary,
}: {
  id: string;
  version: string;
  title: string;
  /** Período y días, para decidir sin abrir el detalle. */
  summary: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string>();
  const [notesError, setNotesError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const decide = (decision: "APROBADA" | "RECHAZADA") =>
    startTransition(async () => {
      setError(undefined);
      setNotesError(undefined);
      const result = await decideLeaveAction(id, { version, decision, notes });
      if (!result.ok) {
        const fieldError = result.error.fieldErrors?.notes?.[0];
        if (fieldError) setNotesError(fieldError);
        else setError(result.error.message);
        return;
      }
      toast.success(decision === "APROBADA" ? "Solicitud aprobada" : "Solicitud rechazada");
      setOpen(false);
      router.refresh();
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        setNotes("");
        setError(undefined);
        setNotesError(undefined);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Aprobar o rechazar ${title}`}>
          <Check />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aprobar o rechazar</DialogTitle>
          <DialogDescription>
            {title}. {summary}
          </DialogDescription>
        </DialogHeader>
        {error && <Alert variant="destructive">{error}</Alert>}
        <FormField
          id="decision-notes"
          label="Observaciones"
          error={notesError}
          hint="Obligatorias si se rechaza. Quedan registradas con la decisión."
        >
          <Textarea
            id="decision-notes"
            rows={3}
            value={notes}
            aria-invalid={!!notesError}
            aria-describedby={notesError ? "decision-notes-error" : "decision-notes-hint"}
            onChange={(e) => setNotes(e.target.value)}
          />
        </FormField>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={() => decide("RECHAZADA")} disabled={pending}>
            Rechazar
          </Button>
          <Button onClick={() => decide("APROBADA")} disabled={pending}>
            {pending ? "Guardando…" : "Aprobar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

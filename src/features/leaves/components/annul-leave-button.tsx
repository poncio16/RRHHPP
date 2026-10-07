"use client";

import { Ban } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
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
import { annulLeaveAction } from "../actions";

/** Anulación (baja lógica) con motivo obligatorio. El registro se conserva. */
export function AnnulLeaveButton({ id, version, title }: { id: string; version: string; title: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const confirm = () =>
    startTransition(async () => {
      const result = await annulLeaveAction(id, { version, reason });
      if (!result.ok) {
        setError(result.error.fieldErrors?.reason?.[0] ?? result.error.message);
        return;
      }
      toast.success("Registro anulado");
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
        <Button variant="ghost" size="icon" aria-label={`Anular ${title}`}>
          <Ban />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Anular registro</DialogTitle>
          <DialogDescription>
            {title}. No se borra: queda como anulado, con el motivo, y sus días dejan de contar (también en el saldo de
            vacaciones).
          </DialogDescription>
        </DialogHeader>
        <FormField id="annul-leave-reason" label="Motivo" error={error} required>
          <Textarea
            id="annul-leave-reason"
            rows={3}
            value={reason}
            aria-invalid={!!error}
            aria-describedby={error ? "annul-leave-reason-error" : undefined}
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

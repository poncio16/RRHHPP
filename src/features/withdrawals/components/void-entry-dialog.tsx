"use client";

import { Ban } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormField, fieldA11y } from "@/components/forms/form-field";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { voidEntryAction } from "../actions";

/** Anula un movimiento: deja de sumar al saldo, pero queda a la vista con el motivo. */
export function VoidEntryDialog({ entryId, title }: { entryId: string; title: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [fieldError, setFieldError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(undefined);
    setFieldError(undefined);
    startTransition(async () => {
      const result = await voidEntryAction(entryId, { reason });
      if (!result.ok) {
        const message = result.error.fieldErrors?.reason?.[0];
        if (message) setFieldError(message);
        else setError(result.error.message);
        return;
      }
      toast.success("Se anuló el movimiento");
      setOpen(false);
      setReason("");
      router.refresh();
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) {
          setReason("");
          setError(undefined);
          setFieldError(undefined);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Anular el movimiento ${title}`}>
          <Ban />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Anular movimiento</DialogTitle>
          <DialogDescription>
            {title}. Deja de sumar al saldo, pero sigue a la vista con el motivo. Si la planilla lo vuelve a traer, no
            se carga de nuevo.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {error && <Alert variant="destructive">{error}</Alert>}
          <FormField id="void-reason" label="Motivo" error={fieldError} required>
            <Input
              {...fieldA11y("void-reason", fieldError)}
              value={reason}
              maxLength={200}
              placeholder="Por ejemplo, cargado dos veces en la planilla."
              onChange={(e) => setReason(e.target.value)}
            />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Anulando…" : "Anular"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

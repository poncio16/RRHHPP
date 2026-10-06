"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Muestra la contraseña temporal una sola vez: no se guarda en ningún lado en texto plano. */
export function TemporaryPasswordDialog({
  password,
  email,
  onClose,
}: {
  password: string | null;
  email: string;
  onClose: () => void;
}) {
  return (
    <Dialog open={password !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Contraseña temporal</DialogTitle>
          <DialogDescription>
            Entregásela a {email} por un medio seguro. Al ingresar se le va a pedir que la cambie.
          </DialogDescription>
        </DialogHeader>
        <div className="bg-muted flex items-center gap-2 rounded-md border px-3 py-2">
          <code className="flex-1 font-mono text-base tracking-wide select-all">{password}</code>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Copiar contraseña"
            onClick={async () => {
              await navigator.clipboard.writeText(password ?? "");
              toast.success("Contraseña copiada");
            }}
          >
            <Copy />
          </Button>
        </div>
        <Alert variant="warning">Esta es la única vez que se muestra. Si se pierde, hay que generar otra.</Alert>
        <DialogFooter>
          <Button onClick={onClose}>Listo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

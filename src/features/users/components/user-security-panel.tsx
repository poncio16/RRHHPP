"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { resetPasswordAction, revokeSessionsAction, unlockUserAction } from "../actions";
import { TemporaryPasswordDialog } from "./temporary-password-dialog";

type SessionRow = { id: string; createdAt: Date; lastSeenAt: Date; ip: string | null; userAgent: string | null };

export function UserSecurityPanel({
  userId,
  email,
  locked,
  isSelf,
  sessions,
}: {
  userId: string;
  email: string;
  locked: boolean;
  isSelf: boolean;
  sessions: SessionRow[];
}) {
  const router = useRouter();
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);

  const done = (message: string) => {
    toast.success(message);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        <ConfirmDialog
          trigger={<Button variant="outline">Restablecer contraseña</Button>}
          title="Restablecer contraseña"
          description={`Se genera una contraseña temporal para ${email}, se desbloquea la cuenta y se cierran todas sus sesiones.`}
          confirmLabel="Restablecer"
          onConfirm={async () => {
            const result = await resetPasswordAction(userId);
            if (!result.ok) return result.error.message;
            setTemporaryPassword(result.data.temporaryPassword);
            router.refresh();
          }}
        />
        {locked && (
          <ConfirmDialog
            trigger={<Button variant="outline">Desbloquear</Button>}
            title="Desbloquear cuenta"
            description="La cuenta está bloqueada por intentos fallidos. Al desbloquearla puede volver a ingresar con su contraseña actual."
            confirmLabel="Desbloquear"
            onConfirm={async () => {
              const result = await unlockUserAction(userId);
              if (!result.ok) return result.error.message;
              done("Cuenta desbloqueada");
            }}
          />
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">Sesiones abiertas ({sessions.length})</h3>
          {sessions.length > 0 && !isSelf && (
            <ConfirmDialog
              trigger={
                <Button variant="ghost" size="sm">
                  Cerrar todas
                </Button>
              }
              title="Cerrar todas las sesiones"
              description="El usuario va a tener que volver a ingresar en todos sus dispositivos."
              confirmLabel="Cerrar sesiones"
              destructive
              onConfirm={async () => {
                const result = await revokeSessionsAction(userId);
                if (!result.ok) return result.error.message;
                done("Sesiones cerradas");
              }}
            />
          )}
        </div>
        {sessions.length === 0 ? (
          <p className="text-muted-foreground text-sm">No tiene sesiones abiertas.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Inicio</TableHead>
                <TableHead>Última actividad</TableHead>
                <TableHead className="hidden sm:table-cell">IP</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((session) => (
                <TableRow key={session.id}>
                  <TableCell>{formatDateTime(session.createdAt)}</TableCell>
                  <TableCell>{formatDateTime(session.lastSeenAt)}</TableCell>
                  <TableCell className="hidden sm:table-cell">{session.ip ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        const result = await revokeSessionsAction(userId, session.id);
                        if (!result.ok) toast.error(result.error.message);
                        else done("Sesión cerrada");
                      }}
                    >
                      Cerrar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <TemporaryPasswordDialog password={temporaryPassword} email={email} onClose={() => setTemporaryPassword(null)} />
    </div>
  );
}

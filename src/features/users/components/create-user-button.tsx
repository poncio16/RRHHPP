"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createUserAction } from "../actions";
import { TemporaryPasswordDialog } from "./temporary-password-dialog";
import { UserForm } from "./user-form";

export function CreateUserButton({ roles }: { roles: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button>
            <Plus /> Nuevo usuario
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo usuario</DialogTitle>
            <DialogDescription>Se genera una contraseña temporal que se muestra una sola vez.</DialogDescription>
          </DialogHeader>
          <UserForm
            mode="create"
            roles={roles}
            onCancel={() => setOpen(false)}
            onSubmit={async ({ name, email, roleId }) => {
              const result = await createUserAction({ name, email, roleId });
              if (result.ok) {
                setOpen(false);
                setCreated({ email: email.trim().toLowerCase(), password: result.data.temporaryPassword });
                router.refresh();
              }
              return result;
            }}
          />
        </DialogContent>
      </Dialog>
      <TemporaryPasswordDialog
        password={created?.password ?? null}
        email={created?.email ?? ""}
        onClose={() => setCreated(null)}
      />
    </>
  );
}

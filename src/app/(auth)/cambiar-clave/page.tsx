import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChangePasswordForm } from "@/features/auth/components/change-password-form";
import { logoutAction } from "@/features/auth/actions";
import { getCurrentContext } from "@/server/auth/request";
import { getSetting } from "@/server/settings";

export const metadata: Metadata = { title: "Cambiar contraseña" };

export default function ChangePasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cambiar contraseña</CardTitle>
        <CardDescription>Al cambiarla se cierran tus sesiones en otros dispositivos.</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <Content />
        </Suspense>
      </CardContent>
    </Card>
  );
}

async function Content() {
  const ctx = await getCurrentContext();
  if (!ctx) redirect("/login");
  const { passwordMinLength } = await getSetting("security");

  return (
    <div className="flex flex-col gap-4">
      {ctx.mustChangePassword && (
        <Alert variant="warning">Estás usando una contraseña temporal. Elegí una nueva para continuar.</Alert>
      )}
      <ChangePasswordForm minLength={passwordMinLength} />
      {ctx.mustChangePassword ? (
        <form action={logoutAction} className="text-center">
          <button type="submit" className="text-muted-foreground text-sm underline-offset-4 hover:underline">
            Cerrar sesión
          </button>
        </form>
      ) : (
        <Link
          href="/dashboard"
          className="text-muted-foreground text-center text-sm underline-offset-4 hover:underline"
        >
          Volver
        </Link>
      )}
    </div>
  );
}

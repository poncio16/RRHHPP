import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "@/features/auth/components/login-form";
import { getCurrentContext } from "@/server/auth/request";

export const metadata: Metadata = { title: "Ingresar" };

export default function LoginPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ingresar</CardTitle>
        <CardDescription>Usá el email y la contraseña que te dio el administrador.</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={null}>
          <RedirectIfLoggedIn />
        </Suspense>
        <LoginForm />
      </CardContent>
    </Card>
  );
}

/** Si ya hay una sesión válida, no tiene sentido mostrar el login. */
async function RedirectIfLoggedIn() {
  const ctx = await getCurrentContext();
  if (ctx) redirect(ctx.mustChangePassword ? "/cambiar-clave" : "/dashboard");
  return null;
}

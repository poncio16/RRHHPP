import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { ShellSkeleton } from "@/components/layout/shell-skeleton";
import { getCompanyDisplayName } from "@/features/system/service";
import { getCurrentContext } from "@/server/auth/request";

/**
 * La estructura muestra el menú según los permisos del usuario. No es la barrera
 * de seguridad: cada página y cada operación vuelve a verificar sesión y permisos.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <AuthenticatedShell>{children}</AuthenticatedShell>
    </Suspense>
  );
}

async function AuthenticatedShell({ children }: { children: React.ReactNode }) {
  const ctx = await getCurrentContext();
  if (!ctx) redirect("/login");
  if (ctx.mustChangePassword) redirect("/cambiar-clave");
  const companyName = await getCompanyDisplayName();

  return (
    <AppShell
      companyName={companyName}
      user={{ name: ctx.name, roleName: ctx.roleName, permissions: [...ctx.permissions] }}
    >
      {children}
    </AppShell>
  );
}

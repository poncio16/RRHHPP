import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AccessDenied } from "@/components/feedback/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EditUserForm } from "@/features/users/components/edit-user-form";
import { UserSecurityPanel } from "@/features/users/components/user-security-panel";
import { UserStatusBadge } from "@/features/users/components/user-status-badge";
import { getUser, listRoleOptions } from "@/features/users/service";
import { formatDateTime } from "@/lib/format";
import { z } from "@/lib/zod";
import { requirePageAccess } from "@/server/auth/request";
import { NotFoundError } from "@/server/errors";

export const metadata: Metadata = { title: "Usuario" };

export default function UserDetailPage({ params }: PageProps<"/usuarios/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: PageProps<"/usuarios/[id]">["params"] }) {
  const access = await requirePageAccess("user:manage", "usuarios");
  if (!access.allowed) return <AccessDenied />;

  const parsed = z.uuid().safeParse((await params).id);
  if (!parsed.success) notFound();
  const [user, roles] = await Promise.all([
    getUser(access.ctx, parsed.data).catch((error: unknown) => {
      if (error instanceof NotFoundError) notFound();
      throw error;
    }),
    listRoleOptions(access.ctx),
  ]);
  const isSelf = user.id === access.ctx.userId;
  const locked = !!user.lockedUntil && user.lockedUntil > new Date();

  return (
    <>
      <Link href="/usuarios" className="text-muted-foreground text-sm hover:underline">
        ← Usuarios
      </Link>
      <PageHeader
        title={user.name}
        description={`Creado el ${formatDateTime(user.createdAt)} · Último ingreso: ${user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "nunca"}`}
        actions={<UserStatusBadge {...user} />}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Datos del usuario</CardTitle>
            {isSelf && <CardDescription>No podés cambiar tu propio rol ni desactivarte.</CardDescription>}
          </CardHeader>
          <CardContent>
            <EditUserForm
              userId={user.id}
              roles={roles}
              isSelf={isSelf}
              defaultValues={{ name: user.name, email: user.email, roleId: user.role.id, isActive: user.isActive }}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Acceso</CardTitle>
            <CardDescription>Contraseña, bloqueo y sesiones abiertas.</CardDescription>
          </CardHeader>
          <CardContent>
            <UserSecurityPanel
              userId={user.id}
              email={user.email}
              locked={locked}
              isSelf={isSelf}
              sessions={user.sessions}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

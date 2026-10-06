import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/feedback/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { RolePermissionsMatrix } from "@/features/roles/components/role-permissions-matrix";
import { listRoles } from "@/features/roles/service";
import { UsersTabs } from "@/features/users/components/users-tabs";
import { requirePageAccess } from "@/server/auth/request";

export const metadata: Metadata = { title: "Roles y permisos" };

export default function RolesPage() {
  return (
    <>
      <PageHeader
        title="Usuarios y permisos"
        description="El rol Administrador tiene siempre todos los permisos. Los demás roles se pueden ajustar."
      />
      <UsersTabs current="/usuarios/roles" />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  const access = await requirePageAccess("user:manage", "usuarios");
  if (!access.allowed) return <AccessDenied />;
  const roles = await listRoles(access.ctx);
  return <RolePermissionsMatrix roles={roles} />;
}

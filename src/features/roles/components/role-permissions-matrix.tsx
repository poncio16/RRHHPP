"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PERMISSION_GROUPS } from "@/server/authz/permissions";
import { updateRolePermissionsAction } from "../actions";

type RoleRow = {
  id: string;
  name: string;
  description: string | null;
  activeUsers: number;
  editable: boolean;
  permissions: string[];
};

export function RolePermissionsMatrix({ roles }: { roles: RoleRow[] }) {
  const router = useRouter();
  const initial = useMemo(() => Object.fromEntries(roles.map((r) => [r.id, new Set(r.permissions)])), [roles]);
  const [state, setState] = useState<Record<string, Set<string>>>(() =>
    Object.fromEntries(roles.map((r) => [r.id, new Set(r.permissions)])),
  );

  const changedRoles = roles.filter((r) => {
    const a = initial[r.id]!;
    const b = state[r.id]!;
    return a.size !== b.size || [...a].some((p) => !b.has(p));
  });

  const toggle = (roleId: string, permission: string) =>
    setState((prev) => {
      const next = new Set(prev[roleId]);
      if (next.has(permission)) next.delete(permission);
      else next.add(permission);
      return { ...prev, [roleId]: next };
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-card overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-card sticky top-0">
            <tr className="border-b">
              <th className="text-muted-foreground px-3 py-2 text-left text-xs font-medium">Permiso</th>
              {roles.map((role) => (
                <th key={role.id} className="px-3 py-2 text-center text-xs font-medium">
                  {role.name}
                  <span className="text-muted-foreground block font-normal">
                    {role.activeUsers} {role.activeUsers === 1 ? "usuario" : "usuarios"}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_GROUPS.map((group) => (
              <PermissionGroupRows key={group.label} group={group} roles={roles} state={state} onToggle={toggle} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {changedRoles.length > 0 && (
          <span className="text-muted-foreground text-sm">
            Cambios sin guardar en: {changedRoles.map((r) => r.name).join(", ")}
          </span>
        )}
        <Button
          variant="outline"
          disabled={changedRoles.length === 0}
          onClick={() => setState(Object.fromEntries(roles.map((r) => [r.id, new Set(r.permissions)])))}
        >
          Descartar
        </Button>
        <ConfirmDialog
          trigger={<Button disabled={changedRoles.length === 0}>Guardar permisos</Button>}
          title="Guardar cambios de permisos"
          description={`Se actualizan los permisos de: ${changedRoles.map((r) => `${r.name} (${r.activeUsers} usuarios activos)`).join(", ")}. Los cambios se aplican de inmediato y quedan registrados en la auditoría.`}
          confirmLabel="Guardar"
          onConfirm={async () => {
            for (const role of changedRoles) {
              const result = await updateRolePermissionsAction({ roleId: role.id, permissions: [...state[role.id]!] });
              if (!result.ok) return `${role.name}: ${result.error.message}`;
            }
            toast.success("Permisos actualizados");
            router.refresh();
          }}
        />
      </div>
    </div>
  );
}

function PermissionGroupRows({
  group,
  roles,
  state,
  onToggle,
}: {
  group: (typeof PERMISSION_GROUPS)[number];
  roles: RoleRow[];
  state: Record<string, Set<string>>;
  onToggle: (roleId: string, permission: string) => void;
}) {
  return (
    <>
      <tr className="bg-muted/50 border-b">
        <th
          colSpan={roles.length + 1}
          className="text-muted-foreground px-3 py-1.5 text-left text-xs font-semibold tracking-wide uppercase"
        >
          {group.label}
        </th>
      </tr>
      {group.permissions.map((permission) => (
        <tr key={permission.code} className="hover:bg-muted/30 border-b last:border-0">
          <td className="px-3 py-2">{permission.label}</td>
          {roles.map((role) => (
            <td key={role.id} className="px-3 py-2 text-center">
              <Checkbox
                aria-label={`${permission.label} — ${role.name}`}
                checked={state[role.id]!.has(permission.code)}
                disabled={!role.editable}
                onChange={() => onToggle(role.id, permission.code)}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

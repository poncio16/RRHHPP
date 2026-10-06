"use client";

import { Menu, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SidebarNav } from "./sidebar-nav";
import { UserMenu } from "./user-menu";

/** Estructura de la aplicación: sidebar fija en escritorio, panel deslizable en tablet y móvil. */
type ShellUser = { name: string; roleName: string; permissions: readonly string[] };

export function AppShell({
  companyName,
  user,
  children,
}: {
  companyName: string;
  user: ShellUser;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-dvh">
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" aria-hidden onClick={() => setOpen(false)} />}
      <aside
        className={cn(
          "bg-sidebar text-sidebar-foreground fixed inset-y-0 left-0 z-40 flex w-64 flex-col transition-transform lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-5">
          <span className="font-semibold tracking-tight text-white">RRHH</span>
          <button
            type="button"
            className="hover:bg-sidebar-accent rounded-md p-1 lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="Cerrar menú"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <SidebarNav permissions={user.permissions} onNavigate={() => setOpen(false)} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-card sticky top-0 z-20 flex h-14 items-center gap-3 border-b px-4 lg:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Abrir menú"
          >
            <Menu className="size-5" />
          </Button>
          <span className="text-muted-foreground min-w-0 flex-1 truncate text-sm font-medium">{companyName}</span>
          <UserMenu name={user.name} roleName={user.roleName} />
        </header>
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}

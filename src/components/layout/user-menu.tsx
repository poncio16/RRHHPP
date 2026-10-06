"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, KeyRound, LogOut } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { logoutAction } from "@/features/auth/actions";

export function UserMenu({ name, roleName }: { name: string; roleName: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="hover:bg-accent focus-visible:ring-ring/50 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none focus-visible:ring-[3px]">
        <span className="bg-primary/10 text-primary flex size-7 items-center justify-center rounded-full text-xs font-semibold">
          {initials(name)}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block leading-tight font-medium">{name}</span>
          <span className="text-muted-foreground block text-xs leading-tight">{roleName}</span>
        </span>
        <ChevronDown className="text-muted-foreground size-4" aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="bg-popover z-50 min-w-48 rounded-md border p-1 text-sm shadow-md"
        >
          <div className="px-2 py-1.5 sm:hidden">
            <p className="font-medium">{name}</p>
            <p className="text-muted-foreground text-xs">{roleName}</p>
          </div>
          <DropdownMenu.Item asChild>
            <Link
              href="/cambiar-clave"
              className="data-highlighted:bg-accent flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 outline-none"
            >
              <KeyRound className="size-4" aria-hidden /> Cambiar contraseña
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="bg-border my-1 h-px" />
          <DropdownMenu.Item
            disabled={pending}
            onSelect={() => startTransition(() => logoutAction())}
            className="data-highlighted:bg-accent flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 outline-none data-disabled:opacity-60"
          >
            <LogOut className="size-4" aria-hidden /> {pending ? "Cerrando sesión…" : "Cerrar sesión"}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

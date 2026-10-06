"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isAvailable, visibleNavigation } from "./navigation";

export function SidebarNav({ permissions, onNavigate }: { permissions: readonly string[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const groups = visibleNavigation(permissions);

  return (
    <nav aria-label="Navegación principal" className="flex flex-col gap-5 px-3 py-4">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="text-sidebar-muted px-3 pb-1.5 text-[11px] font-semibold tracking-wider uppercase">
            {group.label}
          </p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              if (!isAvailable(item)) {
                return (
                  <li key={item.href}>
                    <span
                      aria-disabled="true"
                      title={`Se habilita en la Fase ${item.phase}`}
                      className="text-sidebar-muted/70 flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-1.5 text-sm"
                    >
                      <Icon className="size-4" aria-hidden />
                      <span className="flex-1">{item.label}</span>
                      <span className="text-[10px]">Fase {item.phase}</span>
                    </span>
                  </li>
                );
              }
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "hover:bg-sidebar-accent flex items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-colors",
                      active && "bg-sidebar-accent font-medium text-white",
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

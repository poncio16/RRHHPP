import Link from "next/link";
import { cn } from "@/lib/utils";

export function SectionTabs({ tabs, current }: { tabs: { href: string; label: string }[]; current: string }) {
  return (
    <nav className="mb-4 flex gap-1 border-b" aria-label="Secciones">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.href === current ? "page" : undefined}
          className={cn(
            "text-muted-foreground hover:text-foreground -mb-px border-b-2 px-3 py-2 text-sm transition-colors",
            tab.href === current ? "border-primary text-foreground font-medium" : "border-transparent",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

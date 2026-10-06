import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Paginación con enlaces (funciona sin JavaScript y se puede compartir la URL). */
export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  params,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  params: Record<string, string>;
}) {
  const href = (target: number) => `?${new URLSearchParams({ ...params, page: String(target) }).toString()}`;
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-3 border-t px-3 py-3 text-sm">
      <span>
        {total === 0 ? "Sin registros" : `${from}–${to} de ${total} ${total === 1 ? "registro" : "registros"}`}
      </span>
      <div className="flex items-center gap-1">
        <PageLink href={href(page - 1)} disabled={page <= 1} label="Página anterior">
          <ChevronLeft />
        </PageLink>
        <span className="px-2 tabular-nums">
          {page} / {pageCount}
        </span>
        <PageLink href={href(page + 1)} disabled={page >= pageCount} label="Página siguiente">
          <ChevronRight />
        </PageLink>
      </div>
    </div>
  );
}

function PageLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const className = cn(buttonVariants({ variant: "outline", size: "icon" }), "size-8");
  if (disabled) {
    return (
      <span aria-disabled="true" aria-label={label} className={cn(className, "pointer-events-none opacity-40")}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} aria-label={label} className={className} scroll={false}>
      {children}
    </Link>
  );
}

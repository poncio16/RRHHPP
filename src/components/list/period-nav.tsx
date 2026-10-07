import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

/** Navegación entre meses (períodos) con enlaces; sin `nextHref` el botón queda inactivo. */
export function PeriodNav({ label, prevHref, nextHref }: { label: string; prevHref: string; nextHref: string | null }) {
  return (
    <div className="flex items-center gap-2">
      <Link href={prevHref} className={buttonVariants({ variant: "outline", size: "icon" })} aria-label="Mes anterior">
        <ChevronLeft />
      </Link>
      <p className="min-w-40 text-center font-medium first-letter:uppercase">{label}</p>
      {nextHref ? (
        <Link
          href={nextHref}
          className={buttonVariants({ variant: "outline", size: "icon" })}
          aria-label="Mes siguiente"
        >
          <ChevronRight />
        </Link>
      ) : (
        <span
          className={buttonVariants({ variant: "outline", size: "icon", className: "pointer-events-none opacity-50" })}
          aria-hidden
        >
          <ChevronRight />
        </span>
      )}
    </div>
  );
}

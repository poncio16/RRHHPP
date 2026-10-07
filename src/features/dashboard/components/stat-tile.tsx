import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

/** Indicador con un número grande, su nombre y una línea de contexto. */
export function StatTile({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  href?: string;
}) {
  const body = (
    <>
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-muted-foreground mt-1 text-xs">{hint}</p>}
    </>
  );
  return (
    <Card className="p-4">
      {href ? (
        <Link href={href} className="block rounded-sm hover:underline focus-visible:outline-2">
          {body}
        </Link>
      ) : (
        body
      )}
    </Card>
  );
}

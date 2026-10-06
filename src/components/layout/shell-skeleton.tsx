import { Skeleton } from "@/components/ui/skeleton";

/** Esqueleto mientras se valida la sesión. */
export function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh">
      <div className="bg-sidebar hidden w-64 shrink-0 lg:block" />
      <div className="flex flex-1 flex-col">
        <div className="bg-card flex h-14 items-center border-b px-6">
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="p-6">
          <Skeleton className="h-6 w-48" />
        </div>
      </div>
    </div>
  );
}

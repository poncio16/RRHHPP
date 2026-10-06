import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { getCompanyDisplayName } from "@/features/system/service";

async function CompanyName() {
  const name = await getCompanyDisplayName();
  return <span className="text-muted-foreground truncate text-sm font-medium">{name}</span>;
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <AppShell
      topbar={
        <Suspense fallback={<Skeleton className="h-4 w-40" />}>
          <CompanyName />
        </Suspense>
      }
    >
      {children}
    </AppShell>
  );
}

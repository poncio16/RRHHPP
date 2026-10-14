import { PrintOnlyMain } from "@/components/layout/print-only-main";

/**
 * Páginas para imprimir: sin el menú ni el encabezado de la aplicación. Cada
 * página verifica sesión y permisos igual que las demás.
 */
export default function PrintLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="min-h-screen bg-white p-4 print:min-h-0 print:p-0">
      <PrintOnlyMain />
      {children}
    </main>
  );
}

import { ShieldAlert } from "lucide-react";

export function AccessDenied() {
  return (
    <div className="bg-card flex flex-col items-center gap-2 rounded-lg border px-6 py-12 text-center">
      <ShieldAlert className="text-muted-foreground size-8" aria-hidden />
      <h1 className="font-semibold">No tenés acceso a esta sección</h1>
      <p className="text-muted-foreground max-w-md text-sm">
        Tu rol no incluye el permiso necesario. Si lo necesitás para tu trabajo, pedíselo al administrador del sistema.
      </p>
    </div>
  );
}

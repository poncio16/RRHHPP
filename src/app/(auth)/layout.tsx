export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="bg-background flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <p className="mb-6 text-center text-lg font-semibold tracking-tight">RRHH · Gestión de personal</p>
        {children}
      </div>
    </div>
  );
}

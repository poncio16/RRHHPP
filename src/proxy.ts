import { NextResponse, type NextRequest } from "next/server";

// Debe coincidir con SESSION_COOKIE (src/server/auth/request.ts); el proxy no importa
// código de servidor para mantenerse liviano.
const SESSION_COOKIE = "rrhh_session";
const PUBLIC_PATHS = ["/login"];

/**
 * Chequeo optimista: si no hay cookie de sesión, redirige al login sin
 * renderizar nada. La validación real (sesión vigente, permisos) se hace en
 * cada página, server action y route handler.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isPublic || request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHORIZED", message: "Tu sesión expiró. Volvé a iniciar sesión." } },
      { status: 401 },
    );
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  // Todo salvo archivos estáticos, el favicon y el healthcheck.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health).*)"],
};

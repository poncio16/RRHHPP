import type { NextConfig } from "next";

/**
 * Las subidas de archivos llegan por server actions. El tope técnico es
 * MAX_UPLOAD_MB (src/server/settings/definitions.ts) más el margen del
 * multipart; el límite efectivo se configura en Parámetros.
 */
const UPLOAD_BODY_LIMIT = "21mb";

const isDev = process.env.NODE_ENV === "development";

/**
 * Política de contenido: todo sale del propio servidor. Los scripts en línea
 * se permiten porque el armazón estático (Cache Components) se genera en el
 * build y no puede llevar nonces; igual quedan bloqueados los scripts y marcos
 * externos, los plugins y el envío de formularios a otros sitios. En
 * desarrollo React necesita `unsafe-eval`.
 */
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  // Las URLs llevan búsquedas (nombres, DNI) e ids: no salen hacia otros sitios.
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  // Solo tiene efecto si el sitio se sirve por HTTPS (el navegador lo ignora en HTTP).
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    serverActions: { bodySizeLimit: UPLOAD_BODY_LIMIT },
    proxyClientMaxBodySize: UPLOAD_BODY_LIMIT,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

import type { NextConfig } from "next";

/**
 * La foto del legajo y el Excel de importación llegan por server actions; los
 * adjuntos de los documentos, por `/api/subidas/[id]` (o directo a Vercel
 * Blob). El tope técnico es MAX_UPLOAD_MB (src/server/settings/definitions.ts)
 * más el margen del multipart; el límite efectivo se configura en Parámetros.
 * En Vercel, además, ningún pedido a la aplicación puede superar 4,5 MB.
 */
const UPLOAD_BODY_LIMIT = "21mb";

const isDev = process.env.NODE_ENV === "development";
const onVercel = process.env.VERCEL === "1";

/** Con Vercel Blob, el navegador sube los adjuntos a la API de Vercel. */
const UPLOAD_ORIGINS = process.env.STORAGE_DRIVER === "vercel-blob" ? " https://vercel.com" : "";

/**
 * Política de contenido: todo sale del propio servidor (salvo las subidas a
 * Vercel Blob). Los scripts en línea se permiten porque el armazón estático
 * (Cache Components) se genera en el build y no puede llevar nonces; igual
 * quedan bloqueados los scripts y marcos externos, los plugins y el envío de
 * formularios a otros sitios. En desarrollo React necesita `unsafe-eval`.
 * Los encabezados se fijan en el build: `STORAGE_DRIVER` tiene que estar
 * definida también al construir.
 */
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  `connect-src 'self'${UPLOAD_ORIGINS}`,
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
  // La imagen de producción (Dockerfile) usa el servidor autónomo que genera el build;
  // Vercel arma su propia salida.
  ...(onVercel ? {} : { output: "standalone" as const }),
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

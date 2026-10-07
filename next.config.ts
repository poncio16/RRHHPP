import type { NextConfig } from "next";

/**
 * Las subidas de archivos llegan por server actions. El tope técnico es
 * MAX_UPLOAD_MB (src/server/settings/definitions.ts) más el margen del
 * multipart; el límite efectivo se configura en Parámetros.
 */
const UPLOAD_BODY_LIMIT = "21mb";

const nextConfig: NextConfig = {
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

# syntax=docker/dockerfile:1
#
# Imagen de producción de RRHHPP. Se usa desde docker-compose.prod.yml; ver
# docs/operacion.md. Tres etapas:
#   builder  instala dependencias y compila la aplicación;
#   tools    migraciones, seed base y recuperación del administrador;
#   runner   el servidor, sin código fuente ni dependencias de desarrollo.

ARG NODE_IMAGE=node:24-trixie-slim

FROM ${NODE_IMAGE} AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# `postinstall` ejecuta `prisma generate`: necesita el schema y su configuración.
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci
COPY . .
# El build no se conecta a la base, pero las variables tienen que tener un
# formato válido. Estos valores no quedan en la imagen.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" APP_URL="http://localhost:3000" npm run build

FROM ${NODE_IMAGE} AS tools
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
# Lo que usan Prisma y los scripts del seed: sin el build de Next.
COPY --from=builder /app/package.json /app/package-lock.json /app/prisma.config.ts /app/tsconfig.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src ./src
USER node
CMD ["npx", "prisma", "migrate", "deploy"]

FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    STORAGE_DIR=/data/storage
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
# Carpeta de adjuntos: se monta un volumen persistente encima.
RUN mkdir -p /data/storage && chown node:node /data/storage
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "server.js"]

# Multi-stage build for the API service.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/rag/package.json packages/rag/package.json
COPY packages/ai/package.json packages/ai/package.json
COPY prisma prisma
RUN npm install --include=dev
RUN npx prisma generate --schema prisma/schema.prisma

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends wget ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd -r app && useradd -r -g app app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY . .
USER app
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/health || exit 1
CMD ["node", "--import", "tsx", "apps/api/src/server.ts"]

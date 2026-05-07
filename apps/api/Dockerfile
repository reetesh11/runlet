FROM node:22-alpine AS base
RUN npm install -g pnpm@9.0.0

# ── Install dependencies ────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/db/package.json ./packages/db/
COPY packages/schemas/package.json ./packages/schemas/
COPY packages/types/package.json ./packages/types/
COPY packages/utils/package.json ./packages/utils/
COPY packages/queue/package.json ./packages/queue/
COPY packages/storage/package.json ./packages/storage/
COPY packages/connectors/package.json ./packages/connectors/
RUN pnpm install --frozen-lockfile --ignore-scripts

# ── Build ───────────────────────────────────────────────────────
FROM deps AS builder
WORKDIR /app
COPY apps/api/src ./apps/api/src
COPY apps/api/tsconfig.json ./apps/api/tsconfig.json
COPY packages ./packages
# Bundle entire app + workspace deps into a single JS file
# esbuild resolves all workspace imports at build time
RUN node_modules/.bin/esbuild apps/api/src/index.ts \
    --bundle \
    --platform=node \
    --target=node22 \
    --outfile=apps/api/dist/index.js \
    --external:@aws-sdk/client-s3 \
    --external:ioredis \
    --external:bullmq \
    --external:postgres \
    --external:hono \
    --external:@hono/node-server \
    --external:@hono/zod-validator \
    --external:next-auth \
    --external:nanoid \
    --external:zod

# ── Runtime ─────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Only copy compiled output + production node_modules
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules 2>/dev/null || true
COPY --from=builder /app/apps/api/dist ./apps/api/dist

EXPOSE 3001
CMD ["node", "apps/api/dist/index.js"]

FROM node:22-alpine AS base
RUN npm install -g pnpm@11.3.0

# ── Install dependencies ────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml ./
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY apps/worker/package.json ./apps/worker/
COPY packages/db/package.json ./packages/db/
COPY packages/types/package.json ./packages/types/
COPY packages/utils/package.json ./packages/utils/
COPY packages/queue/package.json ./packages/queue/
COPY packages/storage/package.json ./packages/storage/
COPY packages/connectors/package.json ./packages/connectors/
RUN pnpm install --frozen-lockfile --ignore-scripts

# ── Build ───────────────────────────────────────────────────────
FROM deps AS builder
WORKDIR /app
COPY apps/worker/src ./apps/worker/src
COPY apps/worker/tsconfig.json ./apps/worker/tsconfig.json
COPY packages ./packages
RUN node_modules/.bin/esbuild apps/worker/src/index.ts \
    --bundle \
    --platform=node \
    --target=node22 \
    --outfile=apps/worker/dist/index.js \
    --external:@aws-sdk/client-s3 \
    --external:ioredis \
    --external:bullmq \
    --external:postgres \
    --external:@anthropic-ai/sdk \
    --external:openai \
    --external:zod

# ── Runtime ─────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist

CMD ["node", "apps/worker/dist/index.js"]

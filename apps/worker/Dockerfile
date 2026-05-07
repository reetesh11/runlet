FROM node:22-alpine
RUN corepack enable

WORKDIR /app

COPY pnpm-lock.yaml ./
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY apps/worker ./apps/worker
COPY packages ./packages

RUN corepack prepare --activate && pnpm install --frozen-lockfile

ENV NODE_ENV=production

CMD ["node_modules/.bin/tsx", "apps/worker/src/index.js"]

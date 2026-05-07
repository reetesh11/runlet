FROM node:22-alpine
RUN corepack enable

WORKDIR /app
COPY pnpm-lock.yaml ./
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY apps/api ./apps/api
COPY packages ./packages

RUN corepack prepare --activate && pnpm install --frozen-lockfile

ENV NODE_ENV=production

EXPOSE 3001
CMD ["node_modules/.bin/tsx", "apps/api/src/index.ts"]

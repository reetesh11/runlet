# Runlet — AI Agent Marketplace

> Browse, configure, and deploy AI agents for your team — no code required.

## Stack

| Layer | Tech | Hosted On |
|---|---|---|
| Frontend | Next.js 14 (App Router) | Vercel |
| API | Hono.js | Fly.io |
| Worker | BullMQ | Fly.io |
| Database | PostgreSQL (Drizzle ORM) | Neon |
| Queue | Redis (BullMQ) | Upstash |
| Storage | S3-compatible | Cloudflare R2 |
| Auth | NextAuth.js | — |

**Cost: $0/month** on free tiers for development.

## Monorepo Structure

```
runlet/
├── apps/
│   ├── web/          # Next.js 14 frontend
│   ├── api/          # Hono.js REST API (port 3001)
│   └── worker/       # BullMQ job processor
├── packages/
│   ├── db/           # Drizzle schema + migrations
│   ├── schemas/      # Zod validation schemas
│   ├── queue/        # BullMQ queue definitions
│   ├── storage/      # Cloudflare R2 client
│   ├── connectors/   # Zendesk, Slack, GitHub, Notion
│   ├── types/        # Shared TypeScript types
│   └── utils/        # Shared utilities
└── infra/
    ├── fly/          # Fly.io deployment configs
    ├── docker/       # Local dev containers
    └── r2/           # R2 bucket setup
```

## Quick Start (Local Dev)

### 1. Prerequisites
- Node.js 20+
- pnpm 9+
- Docker (for local Postgres + Redis)

### 2. Clone and install
```bash
git clone https://github.com/your-org/runlet
cd runlet
pnpm install
```

### 3. Configure environment
```bash
cp .env.example .env.local
# Fill in your values — minimum required for local dev:
# DATABASE_URL, REDIS_URL, ANTHROPIC_API_KEY
```

### 4. Start local services
```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

For local dev, update `.env.local`:
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/runlet
REDIS_URL=redis://localhost:6379
```

### 5. Run migrations and seed
```bash
pnpm db:migrate
pnpm db:seed
```

### 6. Start all apps
```bash
pnpm dev
# web:    http://localhost:3000
# api:    http://localhost:3001
# worker: background process
```

### 7. Log in
Open http://localhost:3000/login and use **Dev Login** with `admin@runlet.ai` (no password required in development).

## Running an Agent End-to-End

1. Log in and navigate to **Marketplace**
2. Find "Tier-1 Reply Agent" and click **Add to Workspace**
3. Configure: bind a Zendesk connector (use `api_key` auth method with your Zendesk token)
4. Click **Save** then **Activate**
5. Post to the webhook URL shown in the deployment detail:
```bash
curl -X POST http://localhost:3001/v1/hooks/{workspaceId}/{deploymentId} \
  -H "Content-Type: application/json" \
  -d '{"ticket_id": "12345", "subject": "Cannot log in", "description": "I have been locked out for 2 hours", "channel": "email"}'
```
6. Watch the run appear in the **Runs** tab with the full T1–T9 trace.

## Deployment

### Fly.io (API + Worker)

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# First time: create apps
flyctl apps create runlet-api
flyctl apps create runlet-worker

# Set secrets (run once per app)
flyctl secrets set DATABASE_URL="..." --app runlet-api
flyctl secrets set REDIS_URL="..." --app runlet-api
# ... all other env vars from .env.example

# Deploy
cd apps/api && flyctl deploy --config ../../infra/fly/api.fly.toml
cd apps/worker && flyctl deploy --config ../../infra/fly/worker.fly.toml
```

### Vercel (Web)

Connect your GitHub repo to Vercel. It auto-detects Next.js in `apps/web`.
Set the root directory to `apps/web` in Vercel project settings.

### Cloudflare R2 (Storage)

```bash
# Set R2 credentials in .env.local then:
pnpm r2:setup
```

## Environment Variables

See `.env.example` for all required variables with descriptions.

## Adding a New Connector

1. Create `packages/connectors/src/providers/myservice.ts`
2. Export a `ConnectorDefinition` object with actions
3. Register in `packages/connectors/src/index.ts`
4. That's it — the UI and worker pick it up automatically

## Adding a New Agent

Agents are seeded in `packages/db/src/seed.ts`. For the worker to execute them with real logic, add a prompt definition in `apps/worker/src/agents/prompts.ts`.

## Architecture

See `runlet_architecture.html` and `runlet_technical_design.html` for full diagrams and specifications.

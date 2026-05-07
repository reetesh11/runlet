# Runlet — AI Agent Marketplace

> Deploy, configure, and run AI agents across your team's tools. Think npm for agents — find a pre-built agent, connect your Zendesk/Slack/GitHub, and have it running in minutes.

---

## What is Runlet?

Runlet is a B2B AI agent marketplace. Teams browse a catalogue of pre-built agents (Tier-1 Reply, Escalation Triage, Standup Summariser etc.), install them into their workspace, configure them with their own connectors and safety settings, and activate them via webhook or schedule.

Every run is fully audited with a T1–T9 trace — guardrail checks, LLM calls, connector actions, confidence scores, and cost.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Web app | Next.js 14 (App Router) → Vercel |
| API | Hono.js on Node → Fly.io |
| Worker | BullMQ background processor → Fly.io |
| Database | Drizzle ORM + Neon Postgres |
| Queue | Upstash Redis + BullMQ |
| Storage | Cloudflare R2 |
| Auth | NextAuth.js JWT |
| LLM | Anthropic Claude |

---

## Monorepo Structure

```
runlet/
├── apps/
│   ├── web/          # Next.js 14 — user-facing app (port 3000)
│   ├── api/          # Hono.js REST API (port 3001)
│   └── worker/       # BullMQ job processor (background)
├── packages/
│   ├── db/           # Drizzle schema, migrations, seed scripts
│   ├── queue/        # BullMQ queue definitions + Redis client
│   ├── storage/      # Cloudflare R2 client
│   ├── connectors/   # Zendesk, Slack, GitHub, Notion providers
│   ├── schemas/      # Zod validation schemas
│   ├── types/        # Shared TypeScript types
│   └── utils/        # Encryption, ID generation, HMAC helpers
├── infra/
│   ├── docker/       # docker-compose for local dev
│   ├── fly/          # Fly.io deployment configs
│   └── r2/           # R2 bucket setup script
└── docs/             # Architecture, guides, deployment docs
```

---

## Prerequisites

- Node.js 22+
- pnpm 9+
- Docker Desktop (for local Postgres + Redis)

---

## Local Development Setup

### 1. Clone and install

```bash
git clone https://github.com/your-username/runlet
cd runlet
pnpm install
```

### 2. Environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local`. For local dev the minimum required:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/runlet
REDIS_URL=redis://127.0.0.1:6379
NEXTAUTH_SECRET=generate-with-openssl-rand-base64-32
NEXTAUTH_URL=http://localhost:3000
ANTHROPIC_API_KEY=sk-ant-xxx
PAYLOAD_ENCRYPTION_KEY=generate-with-openssl-rand-hex-32
CONFIG_ENCRYPTION_KEY=generate-with-openssl-rand-hex-32
INTERNAL_API_SECRET=generate-with-openssl-rand-hex-32
R2_ENDPOINT=http://localhost:9000
R2_ACCESS_KEY_ID=minioadmin
R2_SECRET_ACCESS_KEY=minioadmin
R2_BUCKET_PROMPTS=runlet-prompts
R2_BUCKET_PAYLOADS=runlet-payloads
```

Then copy to web:
```bash
cp .env.local apps/web/.env.local
```

### 3. Start Docker services

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

### 4. Database setup

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:seed
cd packages/db && npx tsx --env-file=../../.env.local src/seed-versions.ts && cd ../..
```

### 5. Start everything

```bash
pnpm dev
```

Go to http://localhost:3000 → login with `admin@runlet.ai`

---

## Key Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Start all apps |
| `pnpm build` | Build all apps |
| `pnpm db:generate` | Generate migrations from schema changes |
| `pnpm db:migrate` | Apply migrations to database |
| `pnpm db:seed` | Seed agents and workspace |
| `pnpm db:studio` | Open Drizzle Studio |

---

## User Flow

```
Marketplace → View Agent → Add to Workspace → Configure → Activate → Trigger → View Trace
```

1. Browse `/marketplace` — 5 pre-built agents
2. Click an agent → view detail page
3. Click "Add to Workspace" → install + redirect to config card
4. Fill config card — name, connectors, safety settings, trigger type
5. Click "Save & Activate" → get webhook URL
6. POST JSON to webhook URL → agent runs
7. View `/agents/[id]/runs` → T1–T9 execution trace

---

## Docs

- [Architecture](./docs/ARCHITECTURE.md) — system design, component diagram, data flow
- [Deployment Guide](./docs/DEPLOYMENT.md) — production deployment step by step

---

## License

MIT

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

### One-command start

```bash
git clone https://github.com/your-username/runlet
cd runlet
./start.sh
```

That's it. The script will:

1. Check Node.js, pnpm, and Docker are installed and running
2. Generate `.env.local` with secure random secrets (if it doesn't exist)
3. Install all dependencies via pnpm
4. Pull and start Docker services (Postgres, Redis, MinIO)
5. Wait for each service to be healthy
6. Run database migrations
7. Seed agents, versions, and the 3 flow templates
8. Create MinIO storage buckets
9. Start web (:3000), API (:3001), and worker
10. Open http://localhost:3000 in your browser

**After first run** — add your Anthropic API key to `.env.local` to enable AI agent runs:

```env
ANTHROPIC_API_KEY=sk-ant-xxx
```

Then restart with `./start.sh` (everything else is already set up and the script skips re-seeding).

---

### Manual setup (if you prefer step-by-step)

<details>
<summary>Expand manual steps</summary>

```bash
# 1. Install dependencies
pnpm install

# 2. Copy and fill in environment variables
cp .env.example .env.local
cp .env.local apps/web/.env.local

# 3. Start Docker services
docker compose -f infra/docker/docker-compose.yml up -d

# 4. Database
pnpm db:migrate
pnpm db:seed
pnpm db:seed-versions
pnpm db:seed-flows

# 5. MinIO buckets
pnpm r2:setup

# 6. Start everything
pnpm dev
```

Go to http://localhost:3000 → login with `admin@runlet.ai`

</details>

---

## Key Scripts

| Script | What it does |
|---|---|
| `./start.sh` | **Full setup + start in one command** |
| `pnpm dev` | Start all apps (after setup is done) |
| `pnpm build` | Build all apps |
| `pnpm db:generate` | Generate migrations from schema changes |
| `pnpm db:migrate` | Apply migrations to database |
| `pnpm db:seed` | Seed agents and workspace |
| `pnpm db:seed-versions` | Seed agent versions |
| `pnpm db:seed-flows` | Seed 3 pre-built flow templates with deployments |
| `pnpm r2:setup` | Create MinIO/R2 storage buckets |
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

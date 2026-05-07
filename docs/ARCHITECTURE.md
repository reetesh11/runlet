# Runlet — Architecture

## System Overview

Runlet has three deployed services and a shared package layer.

```
┌─────────────────────────────────────────────────────────────────┐
│                         BROWSER                                  │
│                                                                   │
│   Next.js Web App (Vercel)                                       │
│   ├── Server Components  →  direct DB reads via Drizzle          │
│   ├── /api/auth/[...nextauth]  →  JWT auth                      │
│   └── /api/v1/[[...path]]  →  proxy to Hono API                 │
└────────────────────────┬────────────────────────────────────────┘
                         │ internal HTTP + X-Internal-Secret
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│   Hono API (Fly.io — runlet-api)                                │
│   ├── POST /v1/workspaces/:id/deployments  →  create deployment │
│   ├── POST /v1/workspaces/:id/deployments/:id/activate          │
│   ├── POST /v1/workspaces/:id/deployments/:id/runs  →  enqueue  │
│   ├── GET  /v1/workspaces/:id/runs/:id/audit                    │
│   └── POST /v1/webhooks/:deploymentId  →  external trigger      │
└────────────────────────┬────────────────────────────────────────┘
                         │ BullMQ job
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│   BullMQ Worker (Fly.io — runlet-worker)                        │
│   ├── T1  Fetch deployment config + decrypt                      │
│   ├── T2  Evaluate input guardrails                              │
│   ├── T3  Call LLM (Anthropic Claude)                           │
│   ├── T4  Evaluate output guardrails                             │
│   ├── T5  Execute connector actions (Zendesk/Slack/GitHub)       │
│   ├── T6  Human review gate (if confidence < threshold)          │
│   ├── T7  Write audit events                                     │
│   ├── T8  Store output payload (R2)                              │
│   └── T9  Update run status + metrics                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Infrastructure

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Vercel     │    │   Fly.io     │    │   Fly.io     │
│   (web)      │    │   (api)      │    │   (worker)   │
│  Next.js 14  │    │  Hono + Node │    │  BullMQ Node │
└──────┬───────┘    └──────┬───────┘    └──────┬───────┘
       │                   │                   │
       └───────────────────┴───────────────────┤
                           │                   │
              ┌────────────┴──┐    ┌───────────┴──┐
              │  Neon Postgres │    │ Upstash Redis │
              │  (database)   │    │  (job queue)  │
              └───────────────┘    └──────────────┘
                                          │
                                 ┌────────┴────────┐
                                 │  Cloudflare R2  │
                                 │   (payloads +   │
                                 │    prompts)     │
                                 └─────────────────┘
```

---

## Authentication Flow

```
Browser                Next.js              Hono API
   │                      │                     │
   │──── POST /login ─────▶│                     │
   │      (email)          │                     │
   │                       │── DB lookup user ──▶│
   │                       │◀── user found ──────│
   │                       │                     │
   │◀── Set JWT cookie ────│                     │
   │    (encrypted JWE)    │                     │
   │                       │                     │
   │──── POST /api/v1/ ───▶│                     │
   │      (no auth header) │                     │
   │                       │── getServerSession()│
   │                       │── decrypt JWT       │
   │                       │── add X-Internal-   │
   │                       │   Secret + X-User-Id│
   │                       │──────────────────────▶
   │                       │                     │── verify secret
   │                       │                     │── check membership
   │                       │                     │── handle request
   │◀──── response ────────│◀────────────────────│
```

Key points:
- The browser **never** sends auth tokens to the Hono API directly
- All API calls go through the Next.js proxy at `/api/v1/`
- The proxy adds `X-Internal-Secret` server-side after verifying the session
- The Hono API only accepts requests with the correct internal secret

---

## Database Schema (19 tables)

### Core entities

```
workspaces          users               accounts
├── id              ├── id              ├── id
├── name            ├── email           ├── userId
├── slug            ├── name            ├── provider
└── plan            └── emailVerified   └── providerAccountId

workspace_members
├── workspaceId → workspaces.id
├── userId → users.id
└── role (owner|admin|developer|operator|viewer)
```

### Agent catalogue (marketplace-level, no workspace_id)

```
agents                          agent_versions
├── id                          ├── id
├── slug (unique)               ├── agentId → agents.id
├── displayName                 ├── semver
├── tagline                     ├── modelConfig (jsonb)
├── vertical                    ├── inputSchema (jsonb)
├── category                    ├── outputSchema (jsonb)
├── tags (text[])               ├── requiredConnectors (jsonb)
├── status                      ├── guardrailRules (jsonb)
├── visibility                  ├── promptBody
└── latestPublishedVersionId    └── status
```

### Workspace installations

```
workspace_agents                deployments
├── workspaceId                 ├── workspaceId
├── agentId                     ├── agentId
├── pinnedVersionId             ├── agentVersionId
└── installedBy                 ├── instanceName
                                ├── status
                                ├── connectorBindings (jsonb)
                                ├── encryptedConfig
                                ├── guardrailOverrides (jsonb)
                                ├── triggerType
                                ├── webhookUrl
                                └── webhookSecret
```

### Connectors

```
connectors                      credential_store
├── workspaceId                 ├── connectorId
├── provider                    ├── encryptedData
├── authMethod                  └── expiresAt
├── credentialRef
└── healthStatus
```

### Runs + Audit

```
runs                            audit_events
├── workspaceId                 ├── runId
├── deploymentId                ├── workspaceId
├── status                      ├── eventType (T1–T9)
├── inputPayloadRef             ├── occurredAt
├── outputPayloadRef            ├── guardrailResults (jsonb)
├── durationMs                  ├── llmMetadata (jsonb)
├── llmTokensUsed               └── connectorCall (jsonb)
├── llmCostUsd
└── confidenceScore
```

---

## Run Lifecycle (T1–T9)

Every agent run goes through 9 tiers:

| Tier | Name | What happens |
|---|---|---|
| T1 | Fetch Config | Load deployment, decrypt config, bind connectors |
| T2 | Input Guardrails | Check PII, topic blocklist, content policy |
| T3 | LLM Call | Call Claude with prompt + input payload |
| T4 | Output Guardrails | Check confidence score, output content policy |
| T5 | Connector Actions | Execute Zendesk/Slack/GitHub actions from LLM output |
| T6 | Human Review Gate | If confidence < threshold, pause for human review |
| T7 | Audit Write | Write all events to audit_events table |
| T8 | Payload Storage | Store input/output JSON to Cloudflare R2 |
| T9 | Completion | Update run status, increment counters, send alerts |

---

## Queue Architecture

```
BullMQ Queues (Upstash Redis)
├── run-realtime    (priority: realtime)  — sync responses needed
├── run-standard    (priority: standard)  — normal async runs
├── run-batch       (priority: batch)     — bulk/scheduled runs
├── flow-orchestrate — multi-agent flow DAG execution
├── health-check    — connector health checks
├── search-index    — agent search index updates
└── notify          — Slack/email alerts
```

---

## Proxy Architecture

```
Client code (browser)
  └── fetch('/api/v1/workspaces/xxx/deployments', { method: 'POST' })
        │
        ▼
  Next.js Route: apps/web/src/app/api/v1/[[...path]]/route.ts
        │ getServerSession() — decrypts JWT
        │ adds X-Internal-Secret
        │ adds X-User-Id
        │
        ▼
  Hono API: apps/api/src/index.ts
        │ authMiddleware — verifies X-Internal-Secret
        │ workspaceScopeMiddleware — verifies membership
        │
        ▼
  Route handler: apps/api/src/routes/deployments.ts
```

This means:
- The Hono API is **not publicly accessible** — only via the proxy
- No JWT handling in the API — auth is fully owned by Next.js
- In production: Fly.io API can be restricted to only accept traffic from Vercel IPs

---

## Monorepo Package Dependencies

```
apps/web    → @runlet/db, @runlet/schemas, @runlet/types, @runlet/utils
apps/api    → @runlet/db, @runlet/schemas, @runlet/types, @runlet/utils,
              @runlet/queue, @runlet/storage, @runlet/connectors
apps/worker → @runlet/db, @runlet/types, @runlet/utils,
              @runlet/queue, @runlet/storage, @runlet/connectors

packages/db         → drizzle-orm, postgres, @neondatabase/serverless
packages/queue      → bullmq, ioredis
packages/storage    → @aws-sdk/client-s3
packages/connectors → (per-provider SDKs)
packages/utils      → node:crypto (built-in)
packages/schemas    → zod
packages/types      → (pure TypeScript, no runtime deps)
```

---

## Key Design Decisions

### 1. Agents are marketplace-level, not workspace-level
`agents` table has no `workspace_id`. Agents are public catalogue items authored by users. The `workspace_agents` table links a workspace to an installed agent. This mirrors npm — packages are global, your `package.json` is local.

### 2. JWT over database sessions
NextAuth uses JWT strategy. Sessions are never written to the database. This means:
- Zero DB load from session reads on every request
- Works even if Postgres is slow
- Trade-off: can't force-logout users server-side (Month 12 problem)

### 3. Proxy architecture for API auth
Client code never sends auth tokens to the Hono API. All calls go through `/api/v1/` in Next.js which decrypts the JWT server-side and forwards with an internal secret. This keeps the Hono API stateless and simple.

### 4. Encryption at rest
Agent config and input/output payloads are encrypted with AES-256 before storing in the DB and R2. The encryption keys (`CONFIG_ENCRYPTION_KEY`, `PAYLOAD_ENCRYPTION_KEY`) are never stored in the database — only in environment variables.

### 5. postgres.js over node-postgres
The `pg` package has compatibility issues with newer drizzle-orm versions. `postgres.js` is the recommended driver in drizzle-orm docs and works reliably with `prepare: false` for migrations.

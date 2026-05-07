# Runlet — Deployment Guide

This guide covers:
1. First-time production deployment
2. Deploying changes (day-to-day)
3. Database migrations in production
4. Rolling back a bad deployment
5. Environment variable management

---

## Services & Platforms

| Service | Platform | URL |
|---|---|---|
| Web app | Vercel | https://runlet-web.vercel.app |
| API | Fly.io | https://runlet-api.fly.dev |
| Worker | Fly.io | https://runlet-worker.fly.dev (no HTTP) |
| Database | Neon | via DATABASE_URL |
| Queue | Upstash | via REDIS_URL |
| Storage | Cloudflare R2 | via R2_ENDPOINT |

---

## Prerequisites

```bash
# Install Fly CLI
brew install flyctl

# Login to Fly
flyctl auth login

# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login
```

---

## First-Time Production Deployment

### Step 1 — Create accounts

| Service | URL | Free tier |
|---|---|---|
| Neon | https://neon.tech | 0.5GB, no card |
| Upstash | https://upstash.com | 10k commands/day, no card |
| Cloudflare | https://dash.cloudflare.com | 10GB R2, needs card |
| Anthropic | https://console.anthropic.com | $5 credit |
| Fly.io | https://fly.io | 3 VMs, needs card |
| Vercel | https://vercel.com | unlimited, GitHub login |

### Step 2 — Generate secrets

```bash
echo "NEXTAUTH_SECRET=$(openssl rand -base64 32)"
echo "PAYLOAD_ENCRYPTION_KEY=$(openssl rand -hex 32)"
echo "CONFIG_ENCRYPTION_KEY=$(openssl rand -hex 32)"
echo "INTERNAL_API_SECRET=$(openssl rand -hex 32)"
```

Save these — you'll need them for all three services.

### Step 3 — Create Fly.io apps

```bash
flyctl apps create runlet-api --machines
flyctl apps create runlet-worker --machines
```

### Step 4 — Set Fly.io secrets

Run from monorepo root:

```bash
# API secrets
flyctl secrets set \
  DATABASE_URL="postgresql://...neon.tech/neondb?sslmode=require" \
  REDIS_URL="rediss://:token@xxx.upstash.io:6380" \
  UPSTASH_REDIS_REST_URL="https://xxx.upstash.io" \
  UPSTASH_REDIS_REST_TOKEN="AXxxx" \
  R2_ACCOUNT_ID="xxx" \
  R2_ACCESS_KEY_ID="xxx" \
  R2_SECRET_ACCESS_KEY="xxx" \
  R2_ENDPOINT="https://xxx.r2.cloudflarestorage.com" \
  R2_BUCKET_PROMPTS="runlet-prompts" \
  R2_BUCKET_PAYLOADS="runlet-payloads" \
  ANTHROPIC_API_KEY="sk-ant-xxx" \
  PAYLOAD_ENCRYPTION_KEY="xxx" \
  CONFIG_ENCRYPTION_KEY="xxx" \
  INTERNAL_API_SECRET="xxx" \
  WEB_URL="https://runlet-web.vercel.app" \
  NODE_ENV="production" \
  --app runlet-api

# Worker secrets (same set)
flyctl secrets set \
  DATABASE_URL="postgresql://...neon.tech/neondb?sslmode=require" \
  REDIS_URL="rediss://:token@xxx.upstash.io:6380" \
  UPSTASH_REDIS_REST_URL="https://xxx.upstash.io" \
  UPSTASH_REDIS_REST_TOKEN="AXxxx" \
  R2_ACCOUNT_ID="xxx" \
  R2_ACCESS_KEY_ID="xxx" \
  R2_SECRET_ACCESS_KEY="xxx" \
  R2_ENDPOINT="https://xxx.r2.cloudflarestorage.com" \
  R2_BUCKET_PROMPTS="runlet-prompts" \
  R2_BUCKET_PAYLOADS="runlet-payloads" \
  ANTHROPIC_API_KEY="sk-ant-xxx" \
  PAYLOAD_ENCRYPTION_KEY="xxx" \
  CONFIG_ENCRYPTION_KEY="xxx" \
  INTERNAL_API_SECRET="xxx" \
  NODE_ENV="production" \
  --app runlet-worker
```

### Step 5 — Run database migrations on Neon

```bash
# Temporarily point to Neon in .env.local
# Edit DATABASE_URL to your Neon connection string

pnpm db:migrate
pnpm db:seed
cd packages/db && npx tsx --env-file=../../.env.local src/seed-versions.ts && cd ../..

# Restore local DATABASE_URL
```

### Step 6 — Deploy API to Fly.io

```bash
# Always run from monorepo root
flyctl deploy --app runlet-api --config infra/fly/api.fly.toml
```

### Step 7 — Deploy Worker to Fly.io

```bash
flyctl deploy --app runlet-worker --config infra/fly/worker.fly.toml
```

### Step 8 — Verify API is up

```bash
curl https://runlet-api.fly.dev/health
# Expected: {"status":"ok","ts":"..."}
```

### Step 9 — Set Vercel environment variables

Go to: Vercel Dashboard → runlet-web → Settings → Environment Variables

Add all variables from `.env.example` with production values. Key ones:

```
DATABASE_URL           = neon connection string
REDIS_URL              = upstash rediss:// URL
NEXTAUTH_SECRET        = your generated secret
NEXTAUTH_URL           = https://runlet-web.vercel.app
API_URL                = https://runlet-api.fly.dev
NEXT_PUBLIC_API_URL    = https://runlet-api.fly.dev
INTERNAL_API_SECRET    = your generated secret
PAYLOAD_ENCRYPTION_KEY = your generated key
CONFIG_ENCRYPTION_KEY  = your generated key
```

### Step 10 — Deploy Web to Vercel

```bash
cd apps/web
vercel --prod
```

Or trigger from Vercel dashboard → Deployments → Redeploy.

### Step 11 — Set up GitHub OAuth

1. Go to https://github.com/settings/developers → OAuth Apps → New
2. Homepage URL: `https://runlet-web.vercel.app`
3. Callback URL: `https://runlet-web.vercel.app/api/auth/callback/github`
4. Add to Vercel env vars:
   ```
   GITHUB_OAUTH_CLIENT_ID=xxx
   GITHUB_OAUTH_CLIENT_SECRET=xxx
   ```
5. Redeploy Vercel

### Step 12 — Verify everything

```bash
# API health
curl https://runlet-api.fly.dev/health

# Web app loads
open https://runlet-web.vercel.app

# Login works
# Marketplace shows 5 agents
# Config card saves and activates
```

---

## Deploying Changes (Day-to-Day)

### Web app changes (Next.js)

Vercel auto-deploys on every push to `main`:

```bash
git add .
git commit -m "feat: your change"
git push origin main
# Vercel deploys automatically in ~2 minutes
```

To deploy a specific branch for preview:
```bash
git push origin feat/your-feature
# Vercel creates a preview URL automatically
```

### API changes (Hono)

```bash
# From monorepo root
git add .
git commit -m "feat: your change"
git push origin main

# Deploy to Fly.io
flyctl deploy --app runlet-api --config infra/fly/api.fly.toml
```

### Worker changes (BullMQ)

```bash
# From monorepo root
flyctl deploy --app runlet-worker --config infra/fly/worker.fly.toml
```

### Deploy everything at once

```bash
# Push to git
git add . && git commit -m "feat: your change" && git push origin main

# Deploy API + Worker
flyctl deploy --app runlet-api --config infra/fly/api.fly.toml
flyctl deploy --app runlet-worker --config infra/fly/worker.fly.toml

# Web deploys automatically via Vercel
```

---

## Database Migrations in Production

**Always run migrations before deploying code that depends on them.**

```bash
# Step 1 — Generate migration from schema changes
pnpm db:generate
# Creates a new file in packages/db/migrations/

# Step 2 — Test locally first
pnpm db:migrate
# Verify the app works with the migration

# Step 3 — Point .env.local to Neon temporarily
# Edit DATABASE_URL to production Neon URL

# Step 4 — Run on production
pnpm db:migrate

# Step 5 — Restore local DATABASE_URL
# Edit .env.local back to localhost

# Step 6 — Deploy code changes
flyctl deploy --app runlet-api --config infra/fly/api.fly.toml
```

**Rules:**
- Never deploy code before running its migration
- Always test migrations locally first
- Migrations are applied by `__drizzle_migrations` table — re-running is safe
- Never delete migration files from `packages/db/migrations/`

---

## Rolling Back a Bad Deployment

### Roll back the API

```bash
# List recent deployments
flyctl releases list --app runlet-api

# Roll back to previous version
flyctl deploy --image <previous-image-ref> --app runlet-api

# Or use Fly.io dashboard:
# fly.io/apps/runlet-api → Deployments → click previous → Rollback
```

### Roll back the Worker

```bash
flyctl releases list --app runlet-worker
flyctl deploy --image <previous-image-ref> --app runlet-worker
```

### Roll back the Web app

In Vercel dashboard:
- Go to runlet-web → Deployments
- Find the last working deployment
- Click the three dots → **Promote to Production**

### Roll back a database migration

Drizzle doesn't auto-generate rollback migrations. You need to write a manual SQL rollback:

```bash
# Connect to Neon
psql $DATABASE_URL

# Manually reverse the migration
# e.g. if you added a column:
ALTER TABLE agents DROP COLUMN IF EXISTS new_column;

# Remove the migration record
DELETE FROM __drizzle_migrations WHERE filename = '0001_your_migration.sql';
```

Then revert the schema change in `packages/db/src/schema.ts` and the migration file.

---

## Environment Variable Management

### Adding a new env var

1. Add to `.env.example` with a description
2. Add to `.env.local` locally
3. Add to `apps/web/.env.local`
4. Add to Vercel: Dashboard → Settings → Environment Variables
5. Add to Fly.io:
   ```bash
   flyctl secrets set NEW_VAR="value" --app runlet-api
   flyctl secrets set NEW_VAR="value" --app runlet-worker
   ```

### Rotating a secret

```bash
# Generate new secret
NEW_SECRET=$(openssl rand -hex 32)

# Update Fly.io (triggers automatic redeploy)
flyctl secrets set INTERNAL_API_SECRET="$NEW_SECRET" --app runlet-api
flyctl secrets set INTERNAL_API_SECRET="$NEW_SECRET" --app runlet-worker

# Update Vercel (go to dashboard → env vars → edit)
# Then redeploy Vercel manually

# Update .env.local and apps/web/.env.local
```

**Important:** `NEXTAUTH_SECRET` rotation will invalidate all existing user sessions. Users will need to log in again.

---

## Monitoring

### View API logs

```bash
flyctl logs --app runlet-api
flyctl logs --app runlet-api --tail  # live tail
```

### View Worker logs

```bash
flyctl logs --app runlet-worker
flyctl logs --app runlet-worker --tail
```

### Check Fly.io machine status

```bash
flyctl status --app runlet-api
flyctl status --app runlet-worker
```

### Check Vercel deployment status

```bash
vercel ls  # list deployments
vercel logs <deployment-url>
```

---

## Useful Commands Reference

```bash
# Fly.io
flyctl status --app runlet-api          # machine health
flyctl logs --app runlet-api --tail      # live logs
flyctl ssh console --app runlet-api      # SSH into machine
flyctl releases list --app runlet-api    # deployment history
flyctl secrets list --app runlet-api     # list secret names (not values)

# Vercel
vercel ls                                # list deployments
vercel --prod                            # deploy to production
vercel env ls                            # list env vars

# Database
pnpm db:studio                           # open Drizzle Studio
pnpm db:generate                         # generate migration
pnpm db:migrate                          # apply migration
```

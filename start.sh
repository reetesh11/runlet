#!/usr/bin/env bash
# Runlet one-command local dev starter
# Usage: ./start.sh
set -euo pipefail

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; DIM='\033[2m'; RESET='\033[0m'

info()    { echo -e "  ${CYAN}→${RESET} $*"; }
ok()      { echo -e "  ${GREEN}✓${RESET} $*"; }
warn()    { echo -e "  ${YELLOW}⚠${RESET}  $*"; }
die()     { echo -e "\n  ${RED}✗ $*${RESET}\n" >&2; exit 1; }
step()    { echo -e "\n${BOLD}${BLUE}[$1]${RESET} ${BOLD}$2${RESET}"; }

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# ── Banner ────────────────────────────────────────────────────────────────────
clear
echo -e "${BOLD}${CYAN}"
echo "  ██████╗ ██╗   ██╗███╗   ██╗██╗     ███████╗████████╗"
echo "  ██╔══██╗██║   ██║████╗  ██║██║     ██╔════╝╚══██╔══╝"
echo "  ██████╔╝██║   ██║██╔██╗ ██║██║     █████╗     ██║   "
echo "  ██╔══██╗██║   ██║██║╚██╗██║██║     ██╔══╝     ██║   "
echo "  ██║  ██║╚██████╔╝██║ ╚████║███████╗███████╗   ██║   "
echo "  ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝╚══════╝╚══════╝   ╚═╝   "
echo -e "${RESET}${DIM}  AI Agent Marketplace — Local Development${RESET}"
echo ""

# ── Trap: clean up dev servers on Ctrl+C ─────────────────────────────────────
DEV_PID=""
cleanup() {
  echo -e "\n${YELLOW}  Shutting down…${RESET}"
  [ -n "$DEV_PID" ] && kill "$DEV_PID" 2>/dev/null || true
  echo -e "${DIM}  Docker services are still running. To stop them:${RESET}"
  echo -e "${DIM}  docker compose -f infra/docker/docker-compose.yml down${RESET}\n"
  exit 0
}
trap cleanup INT TERM

# ─────────────────────────────────────────────────────────────────────────────
step "1/6" "Prerequisites"
# ─────────────────────────────────────────────────────────────────────────────

# Node.js
if ! command -v node &>/dev/null; then
  die "Node.js not found. Install Node.js 22+ from https://nodejs.org"
fi
NODE_VER=$(node -e "process.stdout.write(process.version.slice(1).split('.')[0])")
[ "$NODE_VER" -lt 18 ] && die "Node.js 18+ required. Found: $(node --version)"
ok "Node.js $(node --version)"

# pnpm
if ! command -v pnpm &>/dev/null; then
  info "pnpm not found — installing globally…"
  npm install -g pnpm@9 --silent
fi
ok "pnpm $(pnpm --version)"

# Docker
if ! command -v docker &>/dev/null; then
  die "Docker not found. Install Docker Desktop from https://docker.com"
fi
if ! docker info &>/dev/null 2>&1; then
  die "Docker is not running. Please start Docker Desktop and try again."
fi
ok "Docker $(docker --version | awk '{print $3}' | tr -d ',')"

# openssl (for secret generation)
command -v openssl &>/dev/null || die "openssl not found (needed for secret generation)"
ok "openssl $(openssl version | awk '{print $2}')"

# ─────────────────────────────────────────────────────────────────────────────
step "2/6" "Environment"
# ─────────────────────────────────────────────────────────────────────────────

if [ ! -f ".env.local" ]; then
  info "No .env.local found — generating one with secure random secrets…"

  NEXTAUTH_SECRET=$(openssl rand -base64 32)
  PAYLOAD_ENCRYPTION_KEY=$(openssl rand -hex 32)
  CONFIG_ENCRYPTION_KEY=$(openssl rand -hex 32)
  INTERNAL_API_SECRET=$(openssl rand -hex 32)

  cat > .env.local <<ENVEOF
# ── DATABASE (local Docker Postgres) ──────────────────────────────────────────
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/runlet

# ── QUEUE (local Docker Redis) ────────────────────────────────────────────────
REDIS_URL=redis://127.0.0.1:6379

# ── STORAGE (local MinIO — S3-compatible) ─────────────────────────────────────
R2_ENDPOINT=http://localhost:9000
R2_ACCESS_KEY_ID=minioadmin
R2_SECRET_ACCESS_KEY=minioadmin
R2_BUCKET_PROMPTS=runlet-prompts
R2_BUCKET_PAYLOADS=runlet-payloads

# ── AUTH ──────────────────────────────────────────────────────────────────────
NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
NEXTAUTH_URL=http://localhost:3000

# ── LLM ───────────────────────────────────────────────────────────────────────
# Get a free Groq API key at https://console.groq.com
GROQ_API_KEY=
DEFAULT_LLM_MODEL=llama-3.3-70b-versatile
DEFAULT_LLM_PROVIDER=groq

# ── EMAIL (optional for local dev — invite links are logged to console instead)
RESEND_API_KEY=
EMAIL_FROM=Runlet <noreply@runlet.ai>

# ── ENCRYPTION ────────────────────────────────────────────────────────────────
PAYLOAD_ENCRYPTION_KEY=${PAYLOAD_ENCRYPTION_KEY}
CONFIG_ENCRYPTION_KEY=${CONFIG_ENCRYPTION_KEY}

# ── INTERNAL ──────────────────────────────────────────────────────────────────
INTERNAL_API_SECRET=${INTERNAL_API_SECRET}

# ── APP CONFIG ────────────────────────────────────────────────────────────────
NODE_ENV=development
API_URL=http://localhost:3001
WEB_URL=http://localhost:3000
WEBHOOK_BASE_URL=http://localhost:3001
ENVEOF

  ok ".env.local created with generated secrets"
  echo ""
  echo -e "  ${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -e "  ${BOLD}${YELLOW}ACTION REQUIRED:${RESET}"
  echo -e "  ${YELLOW}Add your GROQ_API_KEY to .env.local to enable AI agent runs.${RESET}"
  echo -e "  ${YELLOW}Free key at: https://console.groq.com${RESET}"
  echo -e "  ${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo ""
  read -r -p "  Press Enter to continue (or Ctrl+C to add the key first)… "
else
  ok ".env.local exists"
fi

# Load env vars into this shell (strip comments and blank lines)
set -o allexport
# shellcheck disable=SC1091
source <(grep -v '^\s*#' .env.local | grep '=') || true
set +o allexport

# Warn if GROQ_API_KEY is still empty
if [ -z "${GROQ_API_KEY:-}" ]; then
  warn "GROQ_API_KEY is not set — agent runs won't work yet (free key at https://console.groq.com)"
fi

# Always sync to web app
cp .env.local apps/web/.env.local
ok "Synced to apps/web/.env.local"

# ─────────────────────────────────────────────────────────────────────────────
step "3/6" "Dependencies  (pnpm install)"
# ─────────────────────────────────────────────────────────────────────────────

pnpm install --prefer-offline 2>&1 | tail -3
ok "All dependencies installed"

# ─────────────────────────────────────────────────────────────────────────────
step "4/6" "Docker services  (Postgres · Redis · MinIO)"
# ─────────────────────────────────────────────────────────────────────────────

info "Pulling images (cached if already present)…"
docker compose -f infra/docker/docker-compose.yml pull -q

info "Starting containers…"
docker compose -f infra/docker/docker-compose.yml up -d

# Wait for Postgres
info "Waiting for Postgres…"
for i in $(seq 1 30); do
  if docker compose -f infra/docker/docker-compose.yml exec -T postgres \
       pg_isready -U postgres -q 2>/dev/null; then
    break
  fi
  [ "$i" -eq 30 ] && die "Postgres did not become ready after 30 s"
  sleep 1
done
ok "Postgres   :5432"

# Wait for Redis
info "Waiting for Redis…"
for i in $(seq 1 20); do
  if docker compose -f infra/docker/docker-compose.yml exec -T redis \
       redis-cli ping 2>/dev/null | grep -q PONG; then
    break
  fi
  [ "$i" -eq 20 ] && die "Redis did not become ready after 20 s"
  sleep 1
done
ok "Redis      :6379"

# MinIO starts fast; just give it a moment
sleep 2
ok "MinIO      :9000  (console → http://localhost:9001)"

# ─────────────────────────────────────────────────────────────────────────────
step "5/6" "Database & storage setup"
# ─────────────────────────────────────────────────────────────────────────────

info "Running migrations…"
pnpm db:migrate 2>&1 | tail -5
ok "Migrations applied"

# Idempotent: only seed if the dev user doesn't exist yet
SEEDED=$(docker compose -f infra/docker/docker-compose.yml exec -T postgres \
  psql -U postgres -d runlet -tAc \
  "SELECT COUNT(*) FROM users WHERE id='user_seed_001'" 2>/dev/null || echo "0")
SEEDED=$(echo "$SEEDED" | tr -d '[:space:]')

if [ "${SEEDED:-0}" = "0" ]; then
  info "Seeding agents…"
  pnpm db:seed 2>&1 | grep -E '✅|❌' || true

  info "Seeding agent versions…"
  pnpm db:seed-versions 2>&1 | grep -E '✅|❌' || true

  info "Seeding flow templates…"
  pnpm db:seed-flows 2>&1 | grep -E '✅|❌' || true

  ok "Database seeded"
else
  ok "Database already seeded — skipping"
fi

info "Creating MinIO buckets…"
pnpm r2:setup 2>&1 | grep -E '✓|~' || warn "MinIO bucket setup had issues — check output above"
ok "Storage buckets ready"

# ─────────────────────────────────────────────────────────────────────────────
step "6/6" "Starting dev servers"
# ─────────────────────────────────────────────────────────────────────────────

# Free ports if anything stale is squatting on them
for port in 3000 3001; do
  PIDS=$(lsof -ti :"$port" 2>/dev/null || true)
  if [ -n "$PIDS" ]; then
    warn "Port $port in use — freeing it…"
    echo "$PIDS" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
done

info "Launching web (:3000) · API (:3001) · worker…"
pnpm dev &
DEV_PID=$!

# Wait for web app to respond
info "Waiting for http://localhost:3000…"
for i in $(seq 1 60); do
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null || echo "000")
  if echo "$HTTP" | grep -qE "^(200|307|302|308)"; then
    break
  fi
  [ "$i" -eq 60 ] && { warn "Web app is taking a while — opening browser anyway"; break; }
  sleep 2
done

# Open browser
if command -v open &>/dev/null; then
  open "http://localhost:3000"          # macOS
elif command -v xdg-open &>/dev/null; then
  xdg-open "http://localhost:3000"      # Linux
fi

# ── Ready banner ──────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}  ┌─────────────────────────────────────────────────┐${RESET}"
echo -e "${BOLD}${GREEN}  │  Runlet is ready!                               │${RESET}"
echo -e "${BOLD}${GREEN}  └─────────────────────────────────────────────────┘${RESET}"
echo ""
echo -e "  ${BOLD}Web app${RESET}   →  http://localhost:3000"
echo -e "  ${BOLD}API${RESET}       →  http://localhost:3001"
echo -e "  ${BOLD}MinIO${RESET}     →  http://localhost:9001  ${DIM}(minioadmin / minioadmin)${RESET}"
echo ""
echo -e "  ${BOLD}Login${RESET}     →  admin@runlet.ai  /  Admin123!"
echo ""
echo -e "  ${DIM}Ctrl+C to stop the dev servers${RESET}"
echo ""

wait "$DEV_PID"

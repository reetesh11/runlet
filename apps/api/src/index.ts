import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { prettyJSON } from 'hono/pretty-json'
import { HTTPException } from 'hono/http-exception'
import { ZodError } from 'zod'

import { authMiddleware, workspaceScopeMiddleware } from './middleware/auth'
import { marketplaceRoutes, agentRoutes } from './routes/agents'
import { deploymentRoutes } from './routes/deployments'
import {
  runRoutes,
  flowRoutes,
  connectorRoutes,
  workspaceRoutes,
  webhookRoutes,
} from './routes/misc'

const app = new Hono()

// ── Global middleware ──────────────────────────────────────────
app.use('*', logger())
app.use('*', cors({
  origin: [process.env.WEB_URL ?? 'http://localhost:3000'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Workspace-Id', 'X-API-Key'],
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
}))
app.use('/v1/*', prettyJSON())

// ── Health check ───────────────────────────────────────────────
app.get('/health', (c) => c.json({ status: 'ok', ts: new Date().toISOString() }))
app.get('/', (c) => c.json({ name: 'Runlet API', version: '1.0.0' }))

// ── Public routes ──────────────────────────────────────────────
app.route('/v1/marketplace/agents', marketplaceRoutes)
app.route('/v1/hooks', webhookRoutes)

// ── Authenticated routes ───────────────────────────────────────
const api = new Hono()
api.use('*', authMiddleware)

// Author routes (no workspace scope needed)
api.route('/agents', agentRoutes)
api.route('/workspaces', workspaceRoutes)

// Workspace-scoped routes
const ws = new Hono<{
  Variables: { userId: string; userEmail: string; workspaceId: string; workspaceRole: string }
}>()
ws.use('*', workspaceScopeMiddleware)
ws.route('/deployments', deploymentRoutes)
ws.route('/runs', runRoutes)
ws.route('/flows', flowRoutes)
ws.route('/connectors', connectorRoutes)

api.route('/workspaces/:workspaceId', ws)
app.route('/v1', api)

// ── Error handling ─────────────────────────────────────────────
app.onError((err, c) => {
  console.error('[API Error]', err)

  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status)
  }

  if (err instanceof ZodError) {
    return c.json({ error: 'Validation failed', details: err.errors }, 422)
  }

  return c.json({ error: 'Internal server error' }, 500)
})

app.notFound((c) => c.json({ error: 'Route not found' }, 404))

// ── Start server ───────────────────────────────────────────────
const port = parseInt(process.env.PORT ?? '3001')
console.log(`🚀 Runlet API running on port ${port}`)

serve({ fetch: app.fetch, port })

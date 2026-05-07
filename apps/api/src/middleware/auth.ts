import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { eq, and } from 'drizzle-orm'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '@runlet/db'

let _db: ReturnType<typeof drizzle> | undefined

function getDb() {
  if (!_db) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL not set')
    const client = postgres(url, { prepare: false })
    _db = drizzle(client, { schema })
  }
  return _db
}

// ── Auth middleware ─────────────────────────────────────────────
// All requests now come through the Next.js proxy which adds
// X-Internal-Secret + X-User-Id headers. No JWT handling needed.
export const authMiddleware = createMiddleware<{
  Variables: { userId: string; userEmail: string }
}>(async (c, next) => {
  const internalSecret = c.req.header('X-Internal-Secret')
  const expectedSecret = process.env.INTERNAL_API_SECRET ?? 'dev-internal-secret'

  if (!internalSecret || internalSecret !== expectedSecret) {
    throw new HTTPException(401, { message: 'Authentication required' })
  }

  // User identity is passed from the proxy
  const userId = c.req.header('X-User-Id') ?? 'system'
  const userEmail = c.req.header('X-User-Email') ?? ''

  c.set('userId', userId)
  c.set('userEmail', userEmail)
  await next()
})

// ── Workspace scope middleware ──────────────────────────────────
export const workspaceScopeMiddleware = createMiddleware<{
  Variables: { userId: string; userEmail: string; workspaceId: string; workspaceRole: string }
}>(async (c, next) => {
  const workspaceId = c.req.param('workspaceId') ?? c.req.header('X-Workspace-Id')
  if (!workspaceId) throw new HTTPException(400, { message: 'Workspace ID required' })

  const userId = c.get('userId')

  if (userId === 'system') {
    c.set('workspaceId', workspaceId)
    c.set('workspaceRole', 'admin')
    await next()
    return
  }

  const db = getDb()
  const membership = await db.query.workspaceMembers.findFirst({
    where: and(
      eq(schema.workspaceMembers.workspaceId, workspaceId),
      eq(schema.workspaceMembers.userId, userId)
    ),
  })

  if (!membership) throw new HTTPException(403, { message: 'Not a member of this workspace' })

  c.set('workspaceId', workspaceId)
  c.set('workspaceRole', membership.role)
  await next()
})

// ── Webhook auth middleware ─────────────────────────────────────
// Webhooks come directly from external services — not through proxy
export const webhookAuthMiddleware = createMiddleware(async (c, next) => {
  const signature = c.req.header('X-Runlet-Signature') ?? ''
  const body = await c.req.text()
  const deploymentId = c.req.param('deploymentId')
  if (!deploymentId) throw new HTTPException(400, { message: 'Missing deployment ID' })

  const db = getDb()
  const deployment = await db.query.deployments.findFirst({
    where: eq(schema.deployments.id, deploymentId),
  })
  if (!deployment) throw new HTTPException(404, { message: 'Deployment not found' })

  if (deployment.webhookSecret && signature) {
    const { verifyHmacSignature } = await import('@runlet/utils')
    const valid = verifyHmacSignature(body, signature, deployment.webhookSecret)
    if (!valid) throw new HTTPException(401, { message: 'Invalid webhook signature' })
  }

  await next()
})

import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { db, workspaceMembers, workspaces } from '@runlet/db'
import { eq, and } from 'drizzle-orm'

// ── Auth middleware ─────────────────────────────────────────────
// Validates the session cookie set by NextAuth on the web app.
// For API key auth, checks the X-API-Key header against workspace keys.
export const authMiddleware = createMiddleware<{
  Variables: { userId: string; userEmail: string }
}>(async (c, next) => {
  // Internal service calls (worker → api)
  const internalSecret = c.req.header('X-Internal-Secret')
  if (internalSecret && internalSecret === process.env.INTERNAL_API_SECRET) {
    c.set('userId', 'system')
    c.set('userEmail', 'system@runlet.internal')
    await next()
    return
  }

  // Session token from NextAuth (passed as Authorization: Bearer <session_token>)
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw new HTTPException(401, { message: 'Authentication required' })
  }

  const token = authHeader.slice(7)

  // Validate against NextAuth sessions table
  const session = await db.query.sessions.findFirst({
    where: (s, { eq }) => eq(s.sessionToken, token),
    with: { user: true } as never,
  }).catch(() => null)

  if (!session || new Date(session.expires) < new Date()) {
    throw new HTTPException(401, { message: 'Invalid or expired session' })
  }

  c.set('userId', (session as unknown as { userId: string }).userId)
  c.set('userEmail', ((session as unknown as { user?: { email?: string } }).user?.email) ?? '')
  await next()
})

// ── Workspace scope middleware ───────────────────────────────────
// Attaches workspaceId to context after verifying membership
export const workspaceScopeMiddleware = createMiddleware<{
  Variables: {
    userId: string
    userEmail: string
    workspaceId: string
    workspaceRole: string
  }
}>(async (c, next) => {
  const workspaceId = c.req.param('workspaceId') ?? c.req.header('X-Workspace-Id')

  if (!workspaceId) {
    throw new HTTPException(400, { message: 'Workspace ID required' })
  }

  const userId = c.get('userId')

  // System calls skip membership check
  if (userId === 'system') {
    c.set('workspaceId', workspaceId)
    c.set('workspaceRole', 'admin')
    await next()
    return
  }

  const membership = await db.query.workspaceMembers.findFirst({
    where: and(
      eq(workspaceMembers.workspaceId, workspaceId),
      eq(workspaceMembers.userId, userId)
    ),
  })

  if (!membership) {
    throw new HTTPException(403, { message: 'Not a member of this workspace' })
  }

  c.set('workspaceId', workspaceId)
  c.set('workspaceRole', membership.role)
  await next()
})

// ── Webhook auth middleware ──────────────────────────────────────
export const webhookAuthMiddleware = createMiddleware(async (c, next) => {
  const signature = c.req.header('X-Runlet-Signature') ?? ''
  const body = await c.req.text()

  const deploymentId = c.req.param('deploymentId')
  if (!deploymentId) throw new HTTPException(400, { message: 'Missing deployment ID' })

  const { deployments } = await import('@runlet/db')
  const deployment = await db.query.deployments.findFirst({
    where: eq(deployments.id, deploymentId),
  })

  if (!deployment) throw new HTTPException(404, { message: 'Deployment not found' })

  // If no webhook secret configured, allow (development mode)
  if (deployment.webhookSecret && signature) {
    const { verifyHmacSignature } = await import('@runlet/utils')
    const valid = verifyHmacSignature(body, signature, deployment.webhookSecret)
    if (!valid) throw new HTTPException(401, { message: 'Invalid webhook signature' })
  }

  await next()
})

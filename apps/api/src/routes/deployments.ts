import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { db, deployments, agentVersions, connectors, credentialStore } from '@runlet/db'
import { eq, and, desc } from 'drizzle-orm'
import { CreateDeploymentSchema, UpdateDeploymentSchema, TriggerRunSchema } from '@runlet/schemas'
import { generateId, generateWebhookSecret, encrypt } from '@runlet/utils'
import { enqueueRun, QUEUE_NAMES } from '@runlet/queue'
import type { RunJob } from '@runlet/queue'

type AppEnv = { Variables: { userId: string; userEmail: string; workspaceId: string; workspaceRole: string } }

export const deploymentRoutes = new Hono<AppEnv>()

// ── List deployments for a workspace ──────────────────────────
deploymentRoutes.get('/', async (c) => {
  const workspaceId = c.get('workspaceId') as string
  const all = await db.select().from(deployments)
    .where(eq(deployments.workspaceId, workspaceId))
    .orderBy(desc(deployments.updatedAt))
  return c.json({ data: all })
})

// ── Create deployment ──────────────────────────────────────────
deploymentRoutes.post('/', zValidator('json', CreateDeploymentSchema), async (c) => {
  const workspaceId = c.get('workspaceId') as string
  const body = c.req.valid('json')

  // Validate agent version exists
  const version = await db.query.agentVersions.findFirst({
    where: eq(agentVersions.id, body.agentVersionId),
  })
  if (!version) return c.json({ error: 'Agent version not found' }, 404)

  // Validate all connector bindings exist in workspace
  for (const binding of body.connectorBindings) {
    const connector = await db.query.connectors.findFirst({
      where: and(eq(connectors.id, binding.connectorId), eq(connectors.workspaceId, workspaceId)),
    })
    if (!connector) {
      return c.json({ error: `Connector not found: ${binding.connectorId}` }, 404)
    }
  }

  const id = generateId('dep')
  const webhookSecret = generateWebhookSecret()
  const webhookUrl = `${process.env.WEBHOOK_BASE_URL ?? ''}/v1/hooks/${workspaceId}/${id}`

  // Encrypt config
  const configEncKey = process.env.CONFIG_ENCRYPTION_KEY!
  const encryptedConfig = encrypt(JSON.stringify(body.config), configEncKey)

  const [deployment] = await db.insert(deployments).values({
    id,
    workspaceId,
    agentId: body.agentId,
    agentVersionId: body.agentVersionId,
    instanceName: body.instanceName,
    deploymentEnv: body.deploymentEnv,
    ownerTeam: body.ownerTeam,
    connectorBindings: body.connectorBindings,
    encryptedConfig,
    guardrailOverrides: body.guardrailOverrides as Record<string, unknown> | undefined,
    triggerType: body.triggerType,
    triggerConfig: body.triggerConfig,
    executionMode: body.executionMode,
    alertChannels: body.alertChannels,
    maxRunsPerHour: body.maxRunsPerHour,
    status: 'saved_draft',
    webhookUrl,
    webhookSecret,
  }).returning()

  return c.json({ data: { ...deployment, webhookSecret } }, 201)
})

// ── Get deployment ─────────────────────────────────────────────
deploymentRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')
  const workspaceId = c.get('workspaceId') as string
  const deployment = await db.query.deployments.findFirst({
    where: and(eq(deployments.id, id), eq(deployments.workspaceId, workspaceId)),
  })
  if (!deployment) return c.json({ error: 'Not found' }, 404)
  return c.json({ data: deployment })
})

// ── Update deployment ──────────────────────────────────────────
deploymentRoutes.patch('/:id', zValidator('json', UpdateDeploymentSchema), async (c) => {
  const id = c.req.param('id')
  const workspaceId = c.get('workspaceId') as string
  const body = c.req.valid('json')
  const deployment = await db.query.deployments.findFirst({
    where: and(eq(deployments.id, id), eq(deployments.workspaceId, workspaceId)),
  })
  if (!deployment) return c.json({ error: 'Not found' }, 404)

  const updateData: Record<string, unknown> = { updatedAt: new Date() }
  if (body.instanceName) updateData.instanceName = body.instanceName
  if (body.triggerType) updateData.triggerType = body.triggerType
  if (body.triggerConfig) updateData.triggerConfig = body.triggerConfig
  if (body.alertChannels) updateData.alertChannels = body.alertChannels
  if (body.config) {
    const configEncKey = process.env.CONFIG_ENCRYPTION_KEY!
    updateData.encryptedConfig = encrypt(JSON.stringify(body.config), configEncKey)
  }

  const [updated] = await db.update(deployments).set(updateData).where(eq(deployments.id, id)).returning()
  return c.json({ data: updated })
})

// ── Activate deployment ────────────────────────────────────────
deploymentRoutes.post('/:id/activate', async (c) => {
  const id = c.req.param('id')
  const workspaceId = c.get('workspaceId') as string
  const deployment = await db.query.deployments.findFirst({
    where: and(eq(deployments.id, id), eq(deployments.workspaceId, workspaceId)),
  })
  if (!deployment) return c.json({ error: 'Not found' }, 404)
  if (deployment.status === 'active') return c.json({ data: deployment })

  await db.update(deployments).set({ status: 'active', updatedAt: new Date() }).where(eq(deployments.id, id))

  return c.json({ data: { activated: true, webhookUrl: deployment.webhookUrl } })
})

// ── Pause deployment ───────────────────────────────────────────
deploymentRoutes.post('/:id/pause', async (c) => {
  const id = c.req.param('id')
  const workspaceId = c.get('workspaceId') as string
  await db.update(deployments).set({ status: 'paused', updatedAt: new Date() })
    .where(and(eq(deployments.id, id), eq(deployments.workspaceId, workspaceId)))
  return c.json({ data: { paused: true } })
})

// ── Manual trigger ─────────────────────────────────────────────
deploymentRoutes.post('/:id/runs', zValidator('json', TriggerRunSchema), async (c) => {
  const id = c.req.param('id')
  const workspaceId = c.get('workspaceId') as string
  const body = c.req.valid('json')

  const deployment = await db.query.deployments.findFirst({
    where: and(eq(deployments.id, id), eq(deployments.workspaceId, workspaceId)),
  })
  if (!deployment) return c.json({ error: 'Not found' }, 404)
  if (deployment.status !== 'active' && deployment.deploymentEnv !== 'sandbox') {
    return c.json({ error: 'Deployment is not active. Activate it first or use sandbox environment.' }, 400)
  }

  const { db: dbClient, runs } = await import('@runlet/db')
  const { storePayload } = await import('@runlet/storage')
  const { generateId } = await import('@runlet/utils')

  const runId = generateId('run')
  const inputPayloadRef = await storePayload(runId, 'input', body.input)

  await dbClient.insert(runs).values({
    id: runId,
    workspaceId,
    deploymentId: id,
    status: 'queued',
    queuePriority: body.priority,
    inputPayloadRef,
    triggerType: 'api_call',
    triggerMetadata: { source: 'manual', userId: c.get('userId') },
    depth: 0,
  })

  const job: RunJob = {
    runId,
    workspaceId,
    deploymentId: id,
    inputPayload: body.input,
    triggerType: 'api_call',
    depth: 0,
  }

  await enqueueRun(job, body.priority as 'realtime' | 'standard' | 'batch')

  return c.json({ data: { runId, status: 'queued', pollUrl: `/v1/workspaces/${workspaceId}/runs/${runId}` } }, 202)
})

// ── Delete deployment ──────────────────────────────────────────
deploymentRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const workspaceId = c.get('workspaceId') as string
  await db.delete(deployments).where(and(eq(deployments.id, id), eq(deployments.workspaceId, workspaceId)))
  return c.json({ data: { deleted: true } })
})

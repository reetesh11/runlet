import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { db, runs, auditEvents, flowRuns, flows, connectors, credentialStore, oauthStates, deployments, workspaces, workspaceMembers, users, humanReviewRequests, workspaceSecrets, agents, agentVersions, workspaceAgents } from '@runlet/db'
import { eq, and, desc, sql } from 'drizzle-orm'
import { CreateFlowSchema, UpdateFlowSchema, CreateConnectorSchema, RunsQuerySchema, CreateWorkspaceSchema } from '@runlet/schemas'
import { generateId, encrypt, decrypt } from '@runlet/utils'
import { enqueueRun, flowQueue } from '@runlet/queue'
import type { FlowJob } from '@runlet/queue'

// ── RUNS ───────────────────────────────────────────────────────
export const runRoutes = new Hono()

runRoutes.get('/', zValidator('query', RunsQuerySchema), async (c) => {
  const workspaceId = c.get('workspaceId') as string
  const { status, deploymentId, flowId, page, pageSize } = c.req.valid('query')
  const offset = (page - 1) * pageSize

  const conditions = [eq(runs.workspaceId, workspaceId)]
  if (status) conditions.push(eq(runs.status, status as 'queued' | 'running' | 'success' | 'failed'))
  if (deploymentId) conditions.push(eq(runs.deploymentId, deploymentId))
  if (flowId) conditions.push(eq(runs.flowId, flowId))

  const results = await db.select().from(runs)
    .where(and(...conditions))
    .orderBy(desc(runs.createdAt))
    .limit(pageSize).offset(offset)

  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(runs).where(and(...conditions))

  return c.json({
    data: results,
    pagination: { page, pageSize, total: Number(count), totalPages: Math.ceil(Number(count) / pageSize) },
  })
})

runRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')
  const workspaceId = c.get('workspaceId') as string
  const run = await db.query.runs.findFirst({ where: and(eq(runs.id, id), eq(runs.workspaceId, workspaceId)) })
  if (!run) return c.json({ error: 'Not found' }, 404)
  return c.json({ data: run })
})

runRoutes.patch('/:id/review', async (c) => {
  const id = c.req.param('id')
  const workspaceId = c.get('workspaceId') as string
  const body = await c.req.json().catch(() => ({})) as {
    decision?: 'approved' | 'rejected'
    notes?: string
  }

  if (!body.decision || !['approved', 'rejected'].includes(body.decision)) {
    return c.json({ error: 'decision must be approved or rejected' }, 400)
  }

  const run = await db.query.runs.findFirst({
    where: and(eq(runs.id, id), eq(runs.workspaceId, workspaceId)),
  })
  if (!run) return c.json({ error: 'Not found' }, 404)
  if (run.status !== 'pending_review') {
    return c.json({ error: `Run is not pending review (current status: ${run.status})` }, 409)
  }

  const newStatus = body.decision === 'approved' ? 'success' : 'failed'
  const [updatedRun] = await db
    .update(runs)
    .set({ status: newStatus, completedAt: new Date() })
    .where(eq(runs.id, id))
    .returning()

  // Update humanReviewRequests if a record exists
  const reviewerId = c.get('userId') as string | undefined
  await db
    .update(humanReviewRequests)
    .set({
      reviewDecision: body.decision,
      reviewNotes: body.notes ?? null,
      reviewedBy: reviewerId ?? null,
      resolvedAt: new Date(),
    })
    .where(eq(humanReviewRequests.runId, id))

  return c.json({ data: updatedRun })
})

runRoutes.get('/:id/audit', async (c) => {
  const id = c.req.param('id')
  const workspaceId = c.get('workspaceId') as string
  const run = await db.query.runs.findFirst({ where: and(eq(runs.id, id), eq(runs.workspaceId, workspaceId)) })
  if (!run) return c.json({ error: 'Not found' }, 404)
  const events = await db.select().from(auditEvents).where(eq(auditEvents.runId, id)).orderBy(auditEvents.occurredAt)
  return c.json({ data: events })
})

runRoutes.get('/:id/payload', async (c) => {
  const id = c.req.param('id')
  const workspaceId = c.get('workspaceId') as string
  const type = c.req.query('type') as 'input' | 'output' ?? 'output'
  const run = await db.query.runs.findFirst({ where: and(eq(runs.id, id), eq(runs.workspaceId, workspaceId)) })
  if (!run) return c.json({ error: 'Not found' }, 404)
  const ref = type === 'input' ? run.inputPayloadRef : run.outputPayloadRef
  if (!ref) return c.json({ error: 'Payload not available' }, 404)
  const { getPayload } = await import('@runlet/storage')
  const payload = await getPayload(ref)
  return c.json({ data: payload })
})

// Run analytics
runRoutes.get('/analytics/summary', async (c) => {
  const workspaceId = c.get('workspaceId') as string
  const [stats] = await db.select({
    total: sql<number>`count(*)`,
    success: sql<number>`count(*) filter (where status = 'success')`,
    failed: sql<number>`count(*) filter (where status = 'failed')`,
    blocked: sql<number>`count(*) filter (where status = 'guardrail_blocked')`,
    avgDuration: sql<number>`avg(duration_ms)`,
    totalTokens: sql<number>`sum(llm_tokens_used)`,
  }).from(runs).where(eq(runs.workspaceId, workspaceId))

  return c.json({ data: stats })
})

// ── FLOWS ──────────────────────────────────────────────────────
export const flowRoutes = new Hono()

flowRoutes.get('/', async (c) => {
  const workspaceId = c.get('workspaceId') as string
  const all = await db.select().from(flows).where(eq(flows.workspaceId, workspaceId)).orderBy(desc(flows.updatedAt))
  return c.json({ data: all })
})

flowRoutes.post('/', zValidator('json', CreateFlowSchema), async (c) => {
  const workspaceId = c.get('workspaceId') as string
  const body = c.req.valid('json')
  const id = generateId('flo')
  const [flow] = await db.insert(flows).values({
    id, workspaceId,
    name: body.name,
    description: body.description,
    graphDef: body.graphDef,
    inputSchema: body.inputSchema,
    outputSchema: body.outputSchema,
    trigger: body.trigger,
    status: 'draft',
  }).returning()
  return c.json({ data: flow }, 201)
})

flowRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')
  const workspaceId = c.get('workspaceId') as string
  const flow = await db.query.flows.findFirst({ where: and(eq(flows.id, id), eq(flows.workspaceId, workspaceId)) })
  if (!flow) return c.json({ error: 'Not found' }, 404)
  return c.json({ data: flow })
})

flowRoutes.patch('/:id', zValidator('json', UpdateFlowSchema), async (c) => {
  const id = c.req.param('id')
  const workspaceId = c.get('workspaceId') as string
  const body = c.req.valid('json')
  const [updated] = await db.update(flows).set({ ...body, updatedAt: new Date() })
    .where(and(eq(flows.id, id), eq(flows.workspaceId, workspaceId))).returning()
  return c.json({ data: updated })
})

flowRoutes.post('/:id/activate', async (c) => {
  const id = c.req.param('id')
  const workspaceId = c.get('workspaceId') as string
  await db.update(flows).set({ status: 'active', updatedAt: new Date() })
    .where(and(eq(flows.id, id), eq(flows.workspaceId, workspaceId)))
  return c.json({ data: { activated: true } })
})

flowRoutes.post('/:id/runs', async (c) => {
  const id = c.req.param('id')
  const workspaceId = c.get('workspaceId') as string
  const body = await c.req.json().catch(() => ({})) as { input?: Record<string, unknown> }
  const flow = await db.query.flows.findFirst({ where: and(eq(flows.id, id), eq(flows.workspaceId, workspaceId)) })
  if (!flow) return c.json({ error: 'Not found' }, 404)

  const { storePayload } = await import('@runlet/storage')
  const flowRunId = generateId('flr')
  const inputRef = await storePayload(flowRunId, 'input', body.input ?? {})

  await db.insert(flowRuns).values({
    id: flowRunId, workspaceId, flowId: id,
    status: 'queued', depth: 0,
    inputPayloadRef: inputRef,
    nodeStates: {},
  })

  const job: FlowJob = {
    flowRunId,
    workspaceId,
    flowId: id,
    inputPayload: body.input ?? {},
    depth: 0,
  }
  const q = flowQueue()
  await q.add('flow', job, { jobId: flowRunId })

  return c.json({ data: { flowRunId, status: 'queued' } }, 202)
})

flowRoutes.get('/:id/runs', async (c) => {
  const id = c.req.param('id')
  const workspaceId = c.get('workspaceId') as string
  const allRuns = await db.select().from(flowRuns)
    .where(and(eq(flowRuns.flowId, id), eq(flowRuns.workspaceId, workspaceId)))
    .orderBy(desc(flowRuns.createdAt)).limit(50)
  return c.json({ data: allRuns })
})

flowRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const workspaceId = c.get('workspaceId') as string
  await db.delete(flows).where(and(eq(flows.id, id), eq(flows.workspaceId, workspaceId)))
  return c.json({ data: { deleted: true } })
})

// ── CONNECTORS ─────────────────────────────────────────────────
export const connectorRoutes = new Hono()

connectorRoutes.get('/', async (c) => {
  const workspaceId = c.get('workspaceId') as string
  const all = await db.select().from(connectors).where(eq(connectors.workspaceId, workspaceId))
  return c.json({ data: all })
})

connectorRoutes.post('/', zValidator('json', CreateConnectorSchema), async (c) => {
  const workspaceId = c.get('workspaceId') as string
  const body = c.req.valid('json')
  const id = generateId('con')
  const encKey = process.env.CONFIG_ENCRYPTION_KEY!

  // For API key auth, encrypt immediately
  let credentialRef = `credential:${id}`
  if (body.authMethod === 'api_key' && body.apiKey) {
    const credId = generateId('crd')
    await db.insert(credentialStore).values({
      id: credId,
      connectorId: id,
      encryptedData: encrypt(JSON.stringify({ accessToken: body.apiKey, ...body.metadata }), encKey),
    })
    credentialRef = credId
  }

  const [connector] = await db.insert(connectors).values({
    id,
    workspaceId,
    displayName: body.displayName,
    provider: body.provider,
    authMethod: body.authMethod,
    credentialRef,
    grantedScopes: [],
    healthStatus: 'unknown',
    metadata: body.metadata,
  }).returning()

  // OAuth connectors return an auth URL
  if (body.authMethod === 'oauth2_pkce') {
    const state = generateId('oas')
    await db.insert(oauthStates).values({
      id: generateId('ost'),
      workspaceId,
      provider: body.provider,
      state,
      redirectTo: `/workspace/connectors`,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    })
    const { connectorRegistry } = await import('@runlet/connectors')
    const def = connectorRegistry[body.provider]
    const authUrl = def?.oauthConfig?.authorizationUrl
      .replace('{subdomain}', (body.metadata?.subdomain as string) ?? '')
    return c.json({
      data: connector,
      oauthUrl: authUrl ? `${authUrl}?response_type=code&client_id=${process.env[`${body.provider.toUpperCase()}_CLIENT_ID`]}&state=${state}&scope=${def.oauthConfig?.scopes.join('+')}` : null,
    }, 201)
  }

  return c.json({ data: connector }, 201)
})

connectorRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')
  const workspaceId = c.get('workspaceId') as string
  const connector = await db.query.connectors.findFirst({ where: and(eq(connectors.id, id), eq(connectors.workspaceId, workspaceId)) })
  if (!connector) return c.json({ error: 'Not found' }, 404)
  return c.json({ data: connector })
})

connectorRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const workspaceId = c.get('workspaceId') as string
  await db.delete(connectors).where(and(eq(connectors.id, id), eq(connectors.workspaceId, workspaceId)))
  return c.json({ data: { deleted: true } })
})

connectorRoutes.post('/:id/test', async (c) => {
  const id = c.req.param('id')
  const workspaceId = c.get('workspaceId') as string
  const connector = await db.query.connectors.findFirst({ where: and(eq(connectors.id, id), eq(connectors.workspaceId, workspaceId)) })
  if (!connector) return c.json({ error: 'Not found' }, 404)
  // Basic health: just check we have credentials
  const healthy = connector.credentialRef ? true : false
  await db.update(connectors).set({ healthStatus: healthy ? 'healthy' : 'degraded' }).where(eq(connectors.id, id))
  return c.json({ data: { healthy } })
})

// ── WORKSPACE ──────────────────────────────────────────────────
export const workspaceRoutes = new Hono()

workspaceRoutes.get('/me', async (c) => {
  const userId = c.get('userId') as string
  const memberships = await db.select({ workspace: workspaces, role: workspaceMembers.role })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(eq(workspaceMembers.userId, userId))
  return c.json({ data: memberships })
})

workspaceRoutes.post('/', zValidator('json', CreateWorkspaceSchema), async (c) => {
  const userId = c.get('userId') as string
  const body = c.req.valid('json')
  const id = generateId('ws')

  const [workspace] = await db.insert(workspaces).values({ id, name: body.name, slug: body.slug }).returning()
  await db.insert(workspaceMembers).values({ id: generateId('wm'), workspaceId: id, userId, role: 'owner' })

  return c.json({ data: workspace }, 201)
})

workspaceRoutes.get('/:workspaceId', async (c) => {
  const workspaceId = c.get('workspaceId') as string
  const workspace = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) })
  if (!workspace) return c.json({ error: 'Not found' }, 404)
  return c.json({ data: workspace })
})

workspaceRoutes.get('/:workspaceId/members', async (c) => {
  const workspaceId = c.get('workspaceId') as string
  const members = await db.select({ member: workspaceMembers, user: users })
    .from(workspaceMembers)
    .innerJoin(users, eq(workspaceMembers.userId, users.id))
    .where(eq(workspaceMembers.workspaceId, workspaceId))
  return c.json({ data: members })
})

workspaceRoutes.post('/:workspaceId/members/invite', async (c) => {
  const workspaceId = c.req.param('workspaceId')
  const body = await c.req.json().catch(() => ({})) as { email?: string; role?: string }

  if (!body.email) return c.json({ error: 'email is required' }, 400)
  const email = body.email.toLowerCase().trim()
  const role = (body.role ?? 'developer') as 'owner' | 'admin' | 'developer' | 'operator' | 'viewer'

  // Check if user already exists by email
  let user = await db.query.users.findFirst({ where: eq(users.email, email) })
  let created = false

  if (!user) {
    const newId = generateId('usr')
    const [newUser] = await db.insert(users).values({ id: newId, email }).returning()
    user = newUser
    created = true
  }

  // Check if already a member
  const existing = await db.query.workspaceMembers.findFirst({
    where: and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, user.id)),
  })
  if (existing) {
    return c.json({ error: 'User is already a member of this workspace' }, 409)
  }

  await db.insert(workspaceMembers).values({
    id: generateId('wm'),
    workspaceId,
    userId: user.id,
    role,
  })

  return c.json({ data: { invited: true, userId: user.id, created } }, 201)
})

// ── WEBHOOK INGESTION ──────────────────────────────────────────
export const webhookRoutes = new Hono()

webhookRoutes.post('/:workspaceId/:deploymentId', async (c) => {
  const workspaceId = c.req.param('workspaceId')
  const deploymentId = c.req.param('deploymentId')

  const deployment = await db.query.deployments.findFirst({
    where: and(eq(deployments.id, deploymentId), eq(deployments.workspaceId, workspaceId)),
  })
  if (!deployment) return c.json({ error: 'Not found' }, 404)
  if (deployment.status !== 'active') return c.json({ error: 'Deployment not active' }, 400)

  const body = await c.req.json().catch(() => ({}))

  const { storePayload } = await import('@runlet/storage')
  const { runs: runsTable } = await import('@runlet/db')

  const runId = generateId('run')
  const inputRef = await storePayload(runId, 'input', body)

  await db.insert(runsTable).values({
    id: runId, workspaceId,
    deploymentId,
    status: 'queued',
    queuePriority: 'standard',
    inputPayloadRef: inputRef,
    triggerType: 'webhook',
    triggerMetadata: {
      headers: Object.fromEntries(c.req.raw.headers.entries()),
    },
    depth: 0,
  })

  const job = { runId, workspaceId, deploymentId, inputPayload: body, triggerType: 'webhook', depth: 0 }
  await enqueueRun(job, 'standard')

  return c.json({ data: { runId, status: 'queued' } }, 202)
})

// ── WORKSPACE SECRETS (LLM keys, email keys, etc.) ─────────────
export const secretRoutes = new Hono()

secretRoutes.get('/', async (c) => {
  const workspaceId = c.get('workspaceId') as string
  const rows = await db.select({
    id: workspaceSecrets.id,
    keyName: workspaceSecrets.keyName,
    hint: workspaceSecrets.hint,
    createdAt: workspaceSecrets.createdAt,
    updatedAt: workspaceSecrets.updatedAt,
  }).from(workspaceSecrets).where(eq(workspaceSecrets.workspaceId, workspaceId))
  return c.json({ data: rows })
})

secretRoutes.post('/', async (c) => {
  const workspaceId = c.get('workspaceId') as string
  const body = await c.req.json() as { keyName: string; value: string }
  if (!body.keyName || !body.value) return c.json({ error: 'keyName and value are required' }, 400)

  const encKey = process.env.CONFIG_ENCRYPTION_KEY!
  const hint = body.value.length > 8 ? `...${body.value.slice(-4)}` : '****'
  const encryptedValue = encrypt(body.value, encKey)

  // Upsert — update if keyName already exists for this workspace
  const existing = await db.query.workspaceSecrets.findFirst({
    where: and(eq(workspaceSecrets.workspaceId, workspaceId), eq(workspaceSecrets.keyName, body.keyName)),
  })

  if (existing) {
    await db.update(workspaceSecrets)
      .set({ encryptedValue, hint, updatedAt: new Date() })
      .where(eq(workspaceSecrets.id, existing.id))
    return c.json({ data: { id: existing.id, keyName: body.keyName, hint } })
  }

  const id = generateId('sec')
  await db.insert(workspaceSecrets).values({ id, workspaceId, keyName: body.keyName, encryptedValue, hint })
  return c.json({ data: { id, keyName: body.keyName, hint } }, 201)
})

secretRoutes.delete('/:keyName', async (c) => {
  const workspaceId = c.get('workspaceId') as string
  const keyName = c.req.param('keyName')
  await db.delete(workspaceSecrets)
    .where(and(eq(workspaceSecrets.workspaceId, workspaceId), eq(workspaceSecrets.keyName, keyName)))
  return c.json({ data: { deleted: true } })
})

// ── AGENT STUDIO (create private agents) ──────────────────────
export const agentStudioRoutes = new Hono()

agentStudioRoutes.post('/', async (c) => {
  const workspaceId = c.get('workspaceId') as string
  const userId = c.get('userId') as string
  const body = await c.req.json() as {
    displayName: string
    tagline: string
    category: string
    vertical: string
    systemPrompt: string
    inputSchema?: Record<string, unknown>
    outputSchema?: Record<string, unknown>
    modelProvider: string
    modelId: string
    temperature: number
    maxTokens: number
    requiredConnectors?: Array<{ provider: string; scopes: string[]; optional: boolean }>
  }

  if (!body.displayName || !body.systemPrompt || !body.modelProvider || !body.modelId) {
    return c.json({ error: 'displayName, systemPrompt, modelProvider, modelId are required' }, 400)
  }

  const slug = body.displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36)
  const agentId = generateId('agt')
  const versionId = generateId('ver')

  const modelConfig = { provider: body.modelProvider, modelId: body.modelId, temperature: body.temperature ?? 0.3, maxTokens: body.maxTokens ?? 1000 }
  const guardrails = [{ type: 'confidence_gate', severity: 'warn', config: { threshold: 0.65 } }]

  await db.insert(agents).values({
    id: agentId,
    slug,
    displayName: body.displayName,
    tagline: body.tagline || body.displayName,
    vertical: body.vertical || 'operations',
    category: body.category || 'Custom',
    status: 'published',
    visibility: 'private',
    licence: 'private',
    authorId: userId,
  })

  await db.insert(agentVersions).values({
    id: versionId,
    agentId,
    semver: '1.0.0',
    promptBody: body.systemPrompt,
    modelConfig,
    inputSchema: body.inputSchema ?? { type: 'object', properties: { input: { type: 'string' } } },
    outputSchema: body.outputSchema ?? { type: 'object', properties: { output: { type: 'string' }, confidence_score: { type: 'number' } } },
    requiredConnectors: body.requiredConnectors ?? [],
    guardrailRules: guardrails,
    timeoutSeconds: 120,
    status: 'published',
    versionHash: `custom_${agentId}_v1`,
  })

  await db.update(agents).set({ latestPublishedVersionId: versionId }).where(eq(agents.id, agentId))

  // Auto-install into workspace
  await db.insert(workspaceAgents).values({
    id: generateId('wka'),
    workspaceId,
    agentId,
    installedVersionId: versionId,
  }).catch(() => {})

  return c.json({ data: { agentId, versionId, slug } }, 201)
})

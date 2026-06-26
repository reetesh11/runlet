import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { db, agents, agentVersions, agentStars, workspaceAgents } from '@runlet/db'
import { eq, and, desc, sql, like, or, ilike } from 'drizzle-orm'
import {
  CreateAgentSchema,
  UpdateAgentSchema,
  CreateAgentVersionSchema,
  MarketplaceSearchSchema,
  PaginationSchema,
} from '@runlet/schemas'
import { generateId, slugify, sha256, hashPayload } from '@runlet/utils'
import { storePrompt } from '@runlet/storage'
import { enqueueRun } from '@runlet/queue'
import type { Context } from 'hono'

// ── Marketplace routes (public) ────────────────────────────────
export const marketplaceRoutes = new Hono()

marketplaceRoutes.get('/', zValidator('query', MarketplaceSearchSchema), async (c) => {
  const { q, vertical, category, sort, page, pageSize } = c.req.valid('query')
  const offset = (page - 1) * pageSize

  let query = db.select().from(agents).$dynamic()

  const conditions = [eq(agents.visibility, 'public'), eq(agents.status, 'published')]
  if (vertical) conditions.push(eq(agents.vertical, vertical))
  if (category) conditions.push(eq(agents.category, category))
  if (q) conditions.push(
    or(
      ilike(agents.displayName, `%${q}%`),
      ilike(agents.tagline, `%${q}%`),
    )!
  )

  const finalQuery = query.where(and(...conditions))

  const orderMap = {
    popular: desc(agents.installCount),
    trending: desc(agents.starCount),
    newest: desc(agents.createdAt),
    rating: desc(agents.avgRunSuccessRate),
  }

  const results = await finalQuery
    .orderBy(orderMap[sort] ?? desc(agents.installCount))
    .limit(pageSize)
    .offset(offset)

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(agents)
    .where(and(...conditions))

  return c.json({
    data: results,
    pagination: { page, pageSize, total: Number(count), totalPages: Math.ceil(Number(count) / pageSize) },
  })
})

marketplaceRoutes.get('/:slug', async (c) => {
  const slug = c.req.param('slug')
  const agent = await db.query.agents.findFirst({
    where: and(eq(agents.slug, slug), eq(agents.visibility, 'public')),
  })
  if (!agent) return c.json({ error: 'Not found' }, 404)

  const versions = await db.select().from(agentVersions)
    .where(and(eq(agentVersions.agentId, agent.id), eq(agentVersions.status, 'published')))
    .orderBy(desc(agentVersions.createdAt))

  return c.json({ data: { ...agent, versions } })
})

type AppEnv = { Variables: { userId: string; userEmail: string; workspaceId: string; workspaceRole: string } }

// ── Agent authoring routes (authenticated) ─────────────────────
export const agentRoutes = new Hono<AppEnv>()

agentRoutes.get('/', async (c) => {
  const userId = c.get('userId') as string
  const all = await db.select().from(agents)
    .where(eq(agents.authorId, userId))
    .orderBy(desc(agents.updatedAt))
  return c.json({ data: all })
})

agentRoutes.post('/', zValidator('json', CreateAgentSchema), async (c) => {
  const userId = c.get('userId') as string
  const body = c.req.valid('json')
  const id = generateId('agt')
  const [agent] = await db.insert(agents).values({
    id,
    ...body,
    authorId: userId,
    status: 'draft',
  }).returning()
  return c.json({ data: agent }, 201)
})

agentRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')
  const userId = c.get('userId') as string
  const agent = await db.query.agents.findFirst({ where: eq(agents.id, id) })
  if (!agent) return c.json({ error: 'Not found' }, 404)
  if (agent.authorId !== userId) return c.json({ error: 'Forbidden' }, 403)
  const versions = await db.select().from(agentVersions).where(eq(agentVersions.agentId, id)).orderBy(desc(agentVersions.createdAt))
  return c.json({ data: { ...agent, versions } })
})

agentRoutes.patch('/:id', zValidator('json', UpdateAgentSchema), async (c) => {
  const id = c.req.param('id')
  const userId = c.get('userId') as string
  const body = c.req.valid('json')
  const agent = await db.query.agents.findFirst({ where: eq(agents.id, id) })
  if (!agent) return c.json({ error: 'Not found' }, 404)
  if (agent.authorId !== userId) return c.json({ error: 'Forbidden' }, 403)
  const [updated] = await db.update(agents).set({ ...body, updatedAt: new Date() }).where(eq(agents.id, id)).returning()
  return c.json({ data: updated })
})

agentRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const userId = c.get('userId') as string
  const agent = await db.query.agents.findFirst({ where: eq(agents.id, id) })
  if (!agent) return c.json({ error: 'Not found' }, 404)
  if (agent.authorId !== userId) return c.json({ error: 'Forbidden' }, 403)
  if (agent.status === 'published') return c.json({ error: 'Cannot delete published agent — archive it instead' }, 400)
  await db.delete(agents).where(eq(agents.id, id))
  return c.json({ data: { deleted: true } })
})

// ── Version routes ─────────────────────────────────────────────
agentRoutes.post('/:id/versions', zValidator('json', CreateAgentVersionSchema), async (c) => {
  const agentId = c.req.param('id')
  const userId = c.get('userId') as string
  const body = c.req.valid('json')
  const agent = await db.query.agents.findFirst({ where: eq(agents.id, agentId) })
  if (!agent) return c.json({ error: 'Not found' }, 404)
  if (agent.authorId !== userId) return c.json({ error: 'Forbidden' }, 403)

  const versionId = generateId('ver')
  const promptRef = await storePrompt(body.promptBody)
  const versionHash = sha256(JSON.stringify({
    promptBody: body.promptBody,
    inputSchema: body.inputSchema,
    outputSchema: body.outputSchema,
    guardrailRules: body.guardrailRules,
    modelConfig: body.modelConfig,
  }))

  const [version] = await db.insert(agentVersions).values({
    id: versionId,
    agentId,
    semver: body.semver,
    promptRef,
    promptBody: body.promptBody,
    modelConfig: body.modelConfig,
    inputSchema: body.inputSchema,
    outputSchema: body.outputSchema,
    requiredConnectors: body.requiredConnectors,
    guardrailRules: body.guardrailRules,
    timeoutSeconds: body.timeoutSeconds,
    retryPolicy: body.retryPolicy,
    changelogNotes: body.changelogNotes,
    versionHash,
    status: 'draft',
  }).returning()

  return c.json({ data: version }, 201)
})

// ── Publish route ──────────────────────────────────────────────
agentRoutes.post('/:id/publish', async (c) => {
  const agentId = c.req.param('id')
  const userId = c.get('userId') as string
  const body = await c.req.json().catch(() => ({})) as { versionId?: string }

  const agent = await db.query.agents.findFirst({ where: eq(agents.id, agentId) })
  if (!agent) return c.json({ error: 'Not found' }, 404)
  if (agent.authorId !== userId) return c.json({ error: 'Forbidden' }, 403)

  // Find the version to publish
  const versionId = body.versionId
  let version
  if (versionId) {
    version = await db.query.agentVersions.findFirst({ where: and(eq(agentVersions.id, versionId), eq(agentVersions.agentId, agentId)) })
  } else {
    version = await db.query.agentVersions.findFirst({
      where: and(eq(agentVersions.agentId, agentId), eq(agentVersions.status, 'draft')),
      orderBy: [desc(agentVersions.createdAt)],
    })
  }

  if (!version) return c.json({ error: 'No draft version found to publish' }, 400)

  // Pre-publish validation
  const errors: string[] = []
  if (!version.promptBody || version.promptBody.length < 100) errors.push('prompt_body must be at least 100 characters')
  if (!version.inputSchema || Object.keys(version.inputSchema).length === 0) errors.push('input_schema is required')
  if (!version.outputSchema || Object.keys(version.outputSchema).length === 0) errors.push('output_schema is required')
  if (!version.requiredConnectors?.length) errors.push('At least one required_connector must be declared')
  if (!version.guardrailRules?.length) errors.push('At least one guardrail_rule must be defined')
  if (errors.length > 0) return c.json({ error: 'Validation failed', details: errors }, 422)

  // Publish the version
  await db.update(agentVersions).set({ status: 'published' }).where(eq(agentVersions.id, version.id))

  // Update agent
  await db.update(agents).set({
    status: 'published',
    visibility: agent.visibility === 'draft' ? 'public' : agent.visibility,
    latestPublishedVersionId: version.id,
    updatedAt: new Date(),
  }).where(eq(agents.id, agentId))

  return c.json({ data: { published: true, versionId: version.id } })
})

// ── Star/unstar ────────────────────────────────────────────────
agentRoutes.post('/:id/star', async (c) => {
  const agentId = c.req.param('id')
  const userId = c.get('userId') as string
  await db.insert(agentStars).values({ agentId, userId }).onConflictDoNothing()
  await db.update(agents).set({ starCount: sql`${agents.starCount} + 1` }).where(eq(agents.id, agentId))
  return c.json({ data: { starred: true } })
})

agentRoutes.delete('/:id/star', async (c) => {
  const agentId = c.req.param('id')
  const userId = c.get('userId') as string
  await db.delete(agentStars).where(and(eq(agentStars.agentId, agentId), eq(agentStars.userId, userId)))
  await db.update(agents).set({ starCount: sql`GREATEST(0, ${agents.starCount} - 1)` }).where(eq(agents.id, agentId))
  return c.json({ data: { starred: false } })
})

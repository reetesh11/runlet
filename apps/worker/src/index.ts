import 'dotenv/config'
import { createRunWorkers } from './processors/run.processor'
import { createFlowWorker } from './processors/flow.processor'
import { Worker } from 'bullmq'
import { getRedis, QUEUE_NAMES } from '@runlet/queue'
import type { HealthCheckJob, SearchIndexJob, NotifyJob } from '@runlet/queue'
import { db, connectors } from '@runlet/db'
import { eq } from 'drizzle-orm'

async function main() {
  console.log('🔧 Runlet Worker starting...')

  // ── Run workers (3 priority tiers) ───────────────────────────
  const runWorkers = createRunWorkers()
  console.log(`✓ Run workers started (${runWorkers.length} queues)`)

  // ── Flow orchestrator ─────────────────────────────────────────
  const flowWorker = createFlowWorker()
  console.log('✓ Flow orchestrator started')

  // ── Health check worker ───────────────────────────────────────
  const healthWorker = new Worker<HealthCheckJob>(
    QUEUE_NAMES.HEALTH_CHECK,
    async (job) => {
      const { connectorId, workspaceId } = job.data
      try {
        const connector = await db.query.connectors.findFirst({
          where: (c, { and, eq }) => and(eq(c.id, connectorId), eq(c.workspaceId, workspaceId)),
        })
        if (!connector) return

        // Basic: mark healthy if credentials exist
        const healthy = !!connector.credentialRef
        await db.update(connectors)
          .set({ healthStatus: healthy ? 'healthy' : 'degraded' })
          .where(eq(connectors.id, connectorId))
      } catch (err) {
        console.error('[HealthWorker] Error:', err)
      }
    },
    { connection: getRedis(), concurrency: 10 }
  )
  console.log('✓ Health check worker started')

  // ── Search index worker ───────────────────────────────────────
  const searchIndexWorker = new Worker<SearchIndexJob>(
    QUEUE_NAMES.SEARCH_INDEX,
    async (job) => {
      const { agentId } = job.data
      // Update Postgres tsvector search column for this agent
      try {
        await db.execute(
          // @ts-ignore – raw SQL
          `UPDATE agents SET search_vector = to_tsvector('english',
            coalesce(display_name,'') || ' ' ||
            coalesce(tagline,'') || ' ' ||
            coalesce(description_long,'') || ' ' ||
            coalesce(array_to_string(tags,' '),'')
          ) WHERE id = '${agentId}'`
        )
      } catch (err) {
        console.error('[SearchIndexWorker] Error:', err)
      }
    },
    { connection: getRedis(), concurrency: 5 }
  )
  console.log('✓ Search index worker started')

  // ── Notify worker ─────────────────────────────────────────────
  const notifyWorker = new Worker<NotifyJob>(
    QUEUE_NAMES.NOTIFY,
    async (job) => {
      const { type, channels, payload } = job.data
      for (const channel of channels) {
        if (channel.type === 'email') {
          console.log(`[NotifyWorker] Email to ${channel.destination}: ${type}`)
          // Resend integration would go here
        } else if (channel.type === 'slack') {
          console.log(`[NotifyWorker] Slack to ${channel.destination}: ${type}`)
        }
      }
    },
    { connection: getRedis(), concurrency: 10 }
  )
  console.log('✓ Notify worker started')

  // ── Graceful shutdown ─────────────────────────────────────────
  const allWorkers = [...runWorkers, flowWorker, healthWorker, searchIndexWorker, notifyWorker]

  async function shutdown(signal: string) {
    console.log(`\n[Worker] ${signal} received — shutting down gracefully...`)
    await Promise.all(allWorkers.map(w => w.close()))
    console.log('[Worker] All workers closed. Goodbye.')
    process.exit(0)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))

  console.log('\n✅ All workers running. Waiting for jobs...\n')
}

main().catch(err => {
  console.error('Fatal worker error:', err)
  process.exit(1)
})

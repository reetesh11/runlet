import 'dotenv/config'
import { createRunWorkers } from './processors/run.processor'
import { createFlowWorker } from './processors/flow.processor'
import { Worker } from 'bullmq'
import { getRedis, QUEUE_NAMES, notifyQueue, enqueueRun } from '@runlet/queue'
import type { HealthCheckJob, SearchIndexJob, NotifyJob } from '@runlet/queue'
import { db, connectors, deployments, runs } from '@runlet/db'
import { eq, and } from 'drizzle-orm'
import { generateId } from '@runlet/utils'
import { storePayload } from '@runlet/storage'
import { Resend } from 'resend'

// ── Cron matcher ───────────────────────────────────────────────
// Supports basic cron: minute hour dom month dow  (no ranges/lists yet)
function matchesCronField(field: string, value: number, min: number, max: number): boolean {
  if (field === '*') return true
  // */n  — step
  if (field.startsWith('*/')) {
    const step = parseInt(field.slice(2))
    if (isNaN(step) || step <= 0) return false
    return (value - min) % step === 0
  }
  // exact number
  const n = parseInt(field)
  return !isNaN(n) && n === value
}

function matchesCron(expression: string, date: Date): boolean {
  const parts = expression.trim().split(/\s+/)
  if (parts.length !== 5) return false
  const [minF, hourF, domF, monF, dowF] = parts as [string, string, string, string, string]
  return (
    matchesCronField(minF, date.getUTCMinutes(), 0, 59) &&
    matchesCronField(hourF, date.getUTCHours(), 0, 23) &&
    matchesCronField(domF, date.getUTCDate(), 1, 31) &&
    matchesCronField(monF, date.getUTCMonth() + 1, 1, 12) &&
    matchesCronField(dowF, date.getUTCDay(), 0, 6)
  )
}

// ── Scheduler — runs every 60 seconds ─────────────────────────
async function runScheduler() {
  try {
    const now = new Date()
    // Only fire once per minute — floor to the current minute
    const minuteKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}-${now.getUTCMinutes()}`

    const scheduledDeployments = await db.query.deployments.findMany({
      where: and(
        eq(deployments.triggerType, 'schedule'),
        eq(deployments.status, 'active')
      ),
    })

    for (const deployment of scheduledDeployments) {
      const config = deployment.triggerConfig as Record<string, unknown>
      const cronExpression = config?.cronExpression as string | undefined
      if (!cronExpression) continue

      // Avoid double-firing: track last scheduled minute
      const lastFiredKey = config?.lastScheduledMinute as string | undefined
      if (lastFiredKey === minuteKey) continue

      if (!matchesCron(cronExpression, now)) continue

      // Create a run record
      const runId = generateId('run')
      const inputRef = await storePayload(runId, 'input', { triggeredBy: 'schedule', cronExpression })

      await db.insert(runs).values({
        id: runId,
        workspaceId: deployment.workspaceId,
        deploymentId: deployment.id,
        status: 'queued',
        queuePriority: 'standard',
        inputPayloadRef: inputRef,
        triggerType: 'schedule',
        triggerMetadata: { cronExpression, firedAt: now.toISOString() },
        depth: 0,
      })

      await enqueueRun(
        {
          runId,
          workspaceId: deployment.workspaceId,
          deploymentId: deployment.id,
          inputPayload: { triggeredBy: 'schedule', cronExpression },
          triggerType: 'schedule',
          depth: 0,
        },
        'standard'
      )

      // Persist lastScheduledMinute into triggerConfig so we don't double-fire
      await db
        .update(deployments)
        .set({
          triggerConfig: { ...config, lastScheduledMinute: minuteKey },
          lastRunAt: now,
        })
        .where(eq(deployments.id, deployment.id))

      console.log(`[Scheduler] Enqueued scheduled run ${runId} for deployment ${deployment.id}`)
    }
  } catch (err) {
    console.error('[Scheduler] Error:', err)
  }
}

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
      const { type, channels, payload, runId } = job.data
      for (const channel of channels) {
        if (channel.type === 'email') {
          const apiKey = process.env.RESEND_API_KEY
          const fromEmail = process.env.FROM_EMAIL ?? 'Runlet <noreply@runlet.ai>'
          if (!apiKey) {
            console.log(`[NotifyWorker] RESEND_API_KEY not set — skipping email to ${channel.destination}`)
            continue
          }
          try {
            const resend = new Resend(apiKey)
            const isFailure = type === 'run_failed' || type === 'guardrail_triggered'
            const statusLabel = {
              run_failed: 'Run Failed',
              run_success: 'Run Completed',
              guardrail_triggered: 'Guardrail Triggered',
              human_review_required: 'Human Review Required',
            }[type] ?? type.replace(/_/g, ' ')

            const { error } = await resend.emails.send({
              from: fromEmail,
              to: channel.destination,
              subject: `Runlet: ${statusLabel}`,
              html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:48px 16px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#111118;border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:40px 32px;">
        <tr><td>
          <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:${isFailure ? '#f87171' : '#34d399'};">${statusLabel}</h1>
          ${runId ? `<p style="margin:0 0 16px;font-size:12px;color:#6b7280;font-family:monospace;">Run ID: ${runId}</p>` : ''}
          <p style="margin:0 0 24px;font-size:14px;color:#9ca3af;line-height:1.6;">
            ${payload?.message ?? `A ${statusLabel.toLowerCase()} event occurred in your Runlet workspace.`}
          </p>
          <hr style="border:none;border-top:1px solid rgba(255,255,255,0.07);margin:24px 0 16px;">
          <p style="margin:0;font-size:11px;color:#374151;">You are receiving this because you have alert notifications enabled for this deployment.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
            })
            if (error) {
              console.error(`[NotifyWorker] Resend error for ${channel.destination}:`, error.message)
            } else {
              console.log(`[NotifyWorker] Email sent to ${channel.destination}: ${type}`)
            }
          } catch (err) {
            console.error(`[NotifyWorker] Failed to send email to ${channel.destination}:`, err)
          }
        } else if (channel.type === 'slack') {
          console.log(`[NotifyWorker] Slack to ${channel.destination}: ${type}`)
          // Slack webhook integration would go here
        }
      }
    },
    { connection: getRedis(), concurrency: 10 }
  )
  console.log('✓ Notify worker started')

  // ── Scheduler ─────────────────────────────────────────────────
  const schedulerInterval = setInterval(runScheduler, 60_000)
  // Run immediately on startup to catch any missed schedules
  void runScheduler()
  console.log('✓ Scheduler started (60s interval)')

  // ── Graceful shutdown ─────────────────────────────────────────
  const allWorkers = [...runWorkers, flowWorker, healthWorker, searchIndexWorker, notifyWorker]

  async function shutdown(signal: string) {
    console.log(`\n[Worker] ${signal} received — shutting down gracefully...`)
    clearInterval(schedulerInterval)
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

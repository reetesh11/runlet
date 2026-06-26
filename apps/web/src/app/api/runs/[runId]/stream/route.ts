import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createDb, schema } from '@/lib/db'
import { and, eq } from 'drizzle-orm'

const TERMINAL_STATUSES = new Set([
  'success',
  'failed',
  'guardrail_blocked',
  'cancelled',
  'timeout',
])

const POLL_INTERVAL_MS = 1500
const MAX_DURATION_MS = 3 * 60 * 1000 // 3 minutes

export async function GET(
  req: NextRequest,
  { params }: { params: { runId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const workspaceId = req.nextUrl.searchParams.get('workspaceId')
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId query param is required' }, { status: 400 })
  }

  const { runId } = params
  const db = createDb()
  const startTime = Date.now()

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        const line = `data: ${JSON.stringify(data)}\n\n`
        controller.enqueue(encoder.encode(line))
      }

      function close() {
        try {
          controller.close()
        } catch {
          // already closed
        }
      }

      async function poll() {
        if (Date.now() - startTime >= MAX_DURATION_MS) {
          send({ status: 'timeout', errorMessage: 'Stream timed out after 3 minutes' })
          close()
          return
        }

        try {
          const run = await db.query.runs.findFirst({
            where: and(
              eq(schema.runs.id, runId),
              eq(schema.runs.workspaceId, workspaceId)
            ),
          })

          if (!run) {
            send({ error: 'Run not found' })
            close()
            return
          }

          send({
            status: run.status,
            durationMs: run.durationMs ?? null,
            errorMessage: run.errorMessage ?? null,
          })

          if (TERMINAL_STATUSES.has(run.status)) {
            close()
            return
          }

          // Schedule next poll
          await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
          await poll()
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Internal error'
          send({ error: message })
          close()
        }
      }

      await poll()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

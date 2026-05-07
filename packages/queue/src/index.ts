import { Queue, QueueEvents } from 'bullmq'
import IORedis from 'ioredis'

// ── Redis connection ────────────────────────────────────────────
let _redis: IORedis | undefined

export function getRedis(): IORedis {
  if (!_redis) {
    const url = process.env.REDIS_URL
    if (!url) throw new Error('REDIS_URL environment variable is required')

    const isSecure = url.startsWith('rediss://')
    const isLocal = url.includes('localhost') || url.includes('[IP_ADDRESS]')

    if (isSecure) {
      // cloud redis ( upstaqsh etc) use full URL with TLS
      _redis = new IORedis(url, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        tls: { rejectUnauthorized: false },
      })
    } else {
      // local redis - parse URL and pass explicit host/port
      // Avoid ioredis TLS confusion when passing URL + options together
      const parsed = new URL(url)
      _redis = new IORedis({
        host: parsed.hostname || '127.0.0.1',
        port: parseInt(parsed.port || '6379'),
        password: parsed.password || undefined,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        lazyConnect: false,
      })

    }
  }
  return _redis
}

// ── Queue names ─────────────────────────────────────────────────
export const QUEUE_NAMES = {
  RUN_REALTIME: 'run-realtime',
  RUN_STANDARD: 'run-standard',
  RUN_BATCH: 'run-batch',
  FLOW: 'flow-orchestrate',
  NOTIFY: 'notify',
  HEALTH_CHECK: 'health-check',
  SEARCH_INDEX: 'search-index',
} as const

// ── Job types ───────────────────────────────────────────────────
export interface RunJob {
  runId: string
  workspaceId: string
  deploymentId: string
  inputPayload: Record<string, unknown>
  triggerType: string
  triggerMetadata?: Record<string, unknown>
  depth: number
}

export interface FlowJob {
  flowRunId: string
  workspaceId: string
  flowId: string
  inputPayload: Record<string, unknown>
  parentFlowRunId?: string
  depth: number
}

export interface NotifyJob {
  workspaceId: string
  type: 'run_failed' | 'guardrail_triggered' | 'human_review_required' | 'run_success'
  runId?: string
  channels: Array<{ type: string; destination: string }>
  payload: Record<string, unknown>
}

export interface HealthCheckJob {
  connectorId: string
  workspaceId: string
}

export interface SearchIndexJob {
  agentId: string
}

// ── Queue instances ─────────────────────────────────────────────
function makeQueue<T extends object>(name: string) {
  return new Queue<T>(name, {
    connection: getRedis(),
    defaultJobOptions: {
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  })
}

export const runRealtimeQueue = () => makeQueue<RunJob>(QUEUE_NAMES.RUN_REALTIME)
export const runStandardQueue = () => makeQueue<RunJob>(QUEUE_NAMES.RUN_STANDARD)
export const runBatchQueue = () => makeQueue<RunJob>(QUEUE_NAMES.RUN_BATCH)
export const flowQueue = () => makeQueue<FlowJob>(QUEUE_NAMES.FLOW)
export const notifyQueue = () => makeQueue<NotifyJob>(QUEUE_NAMES.NOTIFY)
export const healthCheckQueue = () => makeQueue<HealthCheckJob>(QUEUE_NAMES.HEALTH_CHECK)
export const searchIndexQueue = () => makeQueue<SearchIndexJob>(QUEUE_NAMES.SEARCH_INDEX)

// ── Helper: enqueue a run based on priority ──────────────────────
export async function enqueueRun(
  job: RunJob,
  priority: 'realtime' | 'standard' | 'batch' = 'standard'
): Promise<string> {
  const queueMap = {
    realtime: runRealtimeQueue(),
    standard: runStandardQueue(),
    batch: runBatchQueue(),
  }
  const q = queueMap[priority]
  const added = await q.add('run', job, { jobId: job.runId })
  return added.id ?? job.runId
}

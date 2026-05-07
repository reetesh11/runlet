import { Worker } from 'bullmq'
import { db, flows, flowRuns, deployments, runs } from '@runlet/db'
import { eq, and } from 'drizzle-orm'
import { getRedis, QUEUE_NAMES, enqueueRun, flowQueue } from '@runlet/queue'
import type { FlowJob, RunJob } from '@runlet/queue'
import { storePayload, getPayload } from '@runlet/storage'
import { generateId } from '@runlet/utils'
import type { FlowGraphDef, FlowNode, FlowEdge } from '@runlet/types'

const MAX_FLOW_DEPTH = 10

async function processFlowJob(job: { data: FlowJob }): Promise<void> {
  const { flowRunId, workspaceId, flowId, inputPayload, parentFlowRunId, depth } = job.data

  if (depth > MAX_FLOW_DEPTH) {
    await db.update(flowRuns).set({
      status: 'failed',
      completedAt: new Date(),
    }).where(eq(flowRuns.id, flowRunId))
    throw new Error(`Max flow depth (${MAX_FLOW_DEPTH}) exceeded`)
  }

  console.log(`[FlowOrch] Processing flow run ${flowRunId} (depth ${depth})`)

  const flow = await db.query.flows.findFirst({ where: eq(flows.id, flowId) })
  if (!flow) throw new Error(`Flow not found: ${flowId}`)

  await db.update(flowRuns).set({ status: 'running' }).where(eq(flowRuns.id, flowRunId))

  const graphDef = flow.graphDef as FlowGraphDef

  // ── Cycle detection ──────────────────────────────────────────
  // Check if this flowId appears in any ancestor flow runs
  if (parentFlowRunId) {
    const ancestors = await getAncestorFlowIds(parentFlowRunId)
    if (ancestors.includes(flowId)) {
      throw new Error(`CyclicFlowError: Flow ${flowId} creates a cycle in the execution graph`)
    }
  }

  // ── Execute nodes in order ────────────────────────────────────
  // Simple sequential execution for now — parallel edges handled below
  let currentPayload: Record<string, unknown> = inputPayload
  const nodeStates: Record<string, { status: string; runId?: string; error?: string }> = {}

  // Find starting nodes (nodes with no incoming edges)
  const nodesWithIncomingEdges = new Set(graphDef.edges.map(e => e.to))
  const startNodes = graphDef.nodes.filter(n => !nodesWithIncomingEdges.has(n.nodeId))

  for (const startNode of startNodes) {
    currentPayload = await executeNodeChain(
      startNode,
      graphDef,
      currentPayload,
      { workspaceId, flowRunId, flowId, depth, nodeStates }
    )
  }

  // ── Complete flow run ─────────────────────────────────────────
  const outputRef = await storePayload(flowRunId, 'output', currentPayload)

  await db.update(flowRuns).set({
    status: 'success',
    completedAt: new Date(),
    outputPayloadRef: outputRef,
    nodeStates,
  }).where(eq(flowRuns.id, flowRunId))

  console.log(`[FlowOrch] Flow run ${flowRunId} completed`)
}

// ── Execute a node and follow its outgoing edges ───────────────
async function executeNodeChain(
  node: FlowNode,
  graphDef: FlowGraphDef,
  inputPayload: Record<string, unknown>,
  ctx: {
    workspaceId: string
    flowRunId: string
    flowId: string
    depth: number
    nodeStates: Record<string, { status: string; runId?: string; error?: string }>
  }
): Promise<Record<string, unknown>> {
  let nodeOutput: Record<string, unknown> = inputPayload

  try {
    ctx.nodeStates[node.nodeId] = { status: 'running' }

    if (node.nodeType === 'agent_deployment' && node.deploymentId) {
      nodeOutput = await executeAgentNode(node, inputPayload, ctx)
    } else if (node.nodeType === 'sub_flow' && node.flowId) {
      nodeOutput = await executeSubFlowNode(node, inputPayload, ctx)
    } else if (node.nodeType === 'transform') {
      nodeOutput = applyTransform(node, inputPayload)
    } else if (node.nodeType === 'human_review_gate') {
      // For now, pass through — human review gates just record and continue
      nodeOutput = { ...inputPayload, _human_review_gate: node.nodeId }
    }

    ctx.nodeStates[node.nodeId] = { status: 'success', ...ctx.nodeStates[node.nodeId] }

  } catch (err) {
    ctx.nodeStates[node.nodeId] = {
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    }
    throw err
  }

  // ── Route to next nodes via matching edges ─────────────────────
  const outgoingEdges = graphDef.edges.filter(e => e.from === node.nodeId)

  // Evaluate conditions and find matching edges
  const matchingEdges = outgoingEdges.filter(edge => {
    if (!edge.condition) return true
    return evaluateCondition(edge.condition, nodeOutput)
  })

  // Group by execution mode
  const parallelEdges = matchingEdges.filter(e => e.executionMode === 'parallel')
  const sequentialEdges = matchingEdges.filter(e => e.executionMode !== 'parallel')

  // Execute parallel edges concurrently
  if (parallelEdges.length > 0) {
    const parallelNodes = parallelEdges.map(e =>
      graphDef.nodes.find(n => n.nodeId === e.to)
    ).filter(Boolean) as FlowNode[]

    await Promise.allSettled(
      parallelNodes.map(n => executeNodeChain(n, graphDef, mapData(parallelEdges.find(e => e.to === n.nodeId)!, nodeOutput), ctx))
    )
  }

  // Execute sequential edges
  let sequentialPayload = nodeOutput
  for (const edge of sequentialEdges) {
    const nextNode = graphDef.nodes.find(n => n.nodeId === edge.to)
    if (!nextNode) continue
    const mappedPayload = mapData(edge, sequentialPayload)
    sequentialPayload = await executeNodeChain(nextNode, graphDef, mappedPayload, ctx)
  }

  return sequentialPayload
}

// ── Execute an agent deployment node ──────────────────────────
async function executeAgentNode(
  node: FlowNode,
  inputPayload: Record<string, unknown>,
  ctx: { workspaceId: string; flowRunId: string; nodeStates: Record<string, { status: string; runId?: string }> }
): Promise<Record<string, unknown>> {
  const runId = generateId('run')
  const inputRef = await storePayload(runId, 'input', inputPayload)

  await db.insert(runs).values({
    id: runId,
    workspaceId: ctx.workspaceId,
    deploymentId: node.deploymentId!,
    flowRunId: ctx.flowRunId,
    status: 'queued',
    queuePriority: 'realtime',
    inputPayloadRef: inputRef,
    triggerType: 'flow_node',
    depth: 0,
  })

  ctx.nodeStates[node.nodeId] = { status: 'running', runId }

  // Enqueue as realtime job and wait for completion
  await enqueueRun({
    runId,
    workspaceId: ctx.workspaceId,
    deploymentId: node.deploymentId!,
    inputPayload,
    triggerType: 'flow_node',
    depth: 0,
  }, 'realtime')

  // Poll for completion (simple polling — in production use Redis pub/sub)
  const maxWaitMs = 120_000
  const pollInterval = 500
  const startTime = Date.now()

  while (Date.now() - startTime < maxWaitMs) {
    await new Promise(r => setTimeout(r, pollInterval))
    const run = await db.query.runs.findFirst({ where: eq(runs.id, runId) })
    if (!run) throw new Error(`Run ${runId} not found`)

    if (run.status === 'success') {
      if (run.outputPayloadRef) {
        return await getPayload<Record<string, unknown>>(run.outputPayloadRef)
      }
      return {}
    }

    if (['failed', 'guardrail_blocked', 'timeout', 'cancelled'].includes(run.status)) {
      throw new Error(`Agent node run failed: ${run.errorMessage ?? run.status}`)
    }
  }

  throw new Error(`Agent node timed out after ${maxWaitMs}ms`)
}

// ── Execute a sub-flow node ─────────────────────────────────────
async function executeSubFlowNode(
  node: FlowNode,
  inputPayload: Record<string, unknown>,
  ctx: { workspaceId: string; flowRunId: string; depth: number }
): Promise<Record<string, unknown>> {
  const childFlowRunId = generateId('flr')
  const inputRef = await storePayload(childFlowRunId, 'input', inputPayload)

  await db.insert(flowRuns).values({
    id: childFlowRunId,
    workspaceId: ctx.workspaceId,
    flowId: node.flowId!,
    parentFlowRunId: ctx.flowRunId,
    status: 'queued',
    depth: ctx.depth + 1,
    inputPayloadRef: inputRef,
    nodeStates: {},
  })

  const q = flowQueue()
  await q.add('flow', {
    flowRunId: childFlowRunId,
    workspaceId: ctx.workspaceId,
    flowId: node.flowId!,
    inputPayload,
    parentFlowRunId: ctx.flowRunId,
    depth: ctx.depth + 1,
  }, { jobId: childFlowRunId })

  // Poll for sub-flow completion
  const maxWaitMs = 300_000
  const pollInterval = 1000
  const startTime = Date.now()

  while (Date.now() - startTime < maxWaitMs) {
    await new Promise(r => setTimeout(r, pollInterval))
    const flowRun = await db.query.flowRuns.findFirst({ where: eq(flowRuns.id, childFlowRunId) })
    if (!flowRun) throw new Error(`Flow run ${childFlowRunId} not found`)

    if (flowRun.status === 'success') {
      if (flowRun.outputPayloadRef) {
        return await getPayload<Record<string, unknown>>(flowRun.outputPayloadRef)
      }
      return {}
    }

    if (['failed', 'cancelled'].includes(flowRun.status)) {
      throw new Error(`Sub-flow failed: ${childFlowRunId}`)
    }
  }

  throw new Error(`Sub-flow timed out after ${maxWaitMs}ms`)
}

// ── Simple transform node ──────────────────────────────────────
function applyTransform(node: FlowNode, input: Record<string, unknown>): Record<string, unknown> {
  const mapping = node.config?.mapping as Record<string, string> | undefined
  if (!mapping) return input

  const output: Record<string, unknown> = {}
  for (const [outputKey, inputPath] of Object.entries(mapping)) {
    const keys = inputPath.replace(/^\$\./, '').split('.')
    let value: unknown = input
    for (const key of keys) {
      value = (value as Record<string, unknown>)?.[key]
    }
    output[outputKey] = value
  }
  return output
}

// ── Condition evaluator (simple) ───────────────────────────────
function evaluateCondition(condition: string, output: Record<string, unknown>): boolean {
  try {
    // Simple expression evaluator — replaces output.field with actual values
    // Example: "output.confidence < 0.75 OR output.escalate == true"
    const expr = condition
      .replace(/output\.(\w+)/g, (_, field) => JSON.stringify(output[field]))
      .replace(/OR/g, '||')
      .replace(/AND/g, '&&')
      .replace(/==/g, '===')
    // eslint-disable-next-line no-new-func
    return Boolean(new Function(`return ${expr}`)())
  } catch {
    return false
  }
}

// ── Data mapper ────────────────────────────────────────────────
function mapData(edge: FlowEdge, output: Record<string, unknown>): Record<string, unknown> {
  if (!edge.dataMapping) return output
  const mapped: Record<string, unknown> = { ...output }
  for (const [targetKey, sourcePath] of Object.entries(edge.dataMapping)) {
    const keys = sourcePath.replace(/^\$\./, '').split('.')
    let value: unknown = output
    for (const key of keys) value = (value as Record<string, unknown>)?.[key]
    mapped[targetKey] = value
  }
  return mapped
}

// ── Get ancestor flow IDs for cycle detection ──────────────────
async function getAncestorFlowIds(flowRunId: string): Promise<string[]> {
  const flowIds: string[] = []
  let currentId: string | undefined = flowRunId

  while (currentId) {
    const run = await db.query.flowRuns.findFirst({ where: eq(flowRuns.id, currentId) })
    if (!run) break
    flowIds.push(run.flowId)
    currentId = run.parentFlowRunId ?? undefined
  }

  return flowIds
}

// ── Create flow worker ────────────────────────────────────────
export function createFlowWorker() {
  const worker = new Worker<FlowJob>(QUEUE_NAMES.FLOW, processFlowJob, {
    connection: getRedis(),
    concurrency: 3,
  })

  worker.on('failed', (job, err) => {
    console.error(`[FlowOrch] Job failed:`, job?.id, err.message)
  })

  return worker
}

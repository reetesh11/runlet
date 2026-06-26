import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { eq, and, desc } from 'drizzle-orm'
import { createDb, schema } from '@/lib/db'
import { formatRelative, formatDate, statusBg } from '@/lib/utils'
import Link from 'next/link'
import { ArrowLeft, GitBranch, Circle } from 'lucide-react'
import { Badge, Empty } from '@/components/ui'

export default async function FlowRunsPage({
  params,
  searchParams,
}: {
  params: { workspaceId: string; flowId: string }
  searchParams: { runId?: string }
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const { workspaceId, flowId } = params
  const selectedRunId = searchParams.runId
  const db = createDb()

  const [flowRows, flowRuns] = await Promise.all([
    db
      .select({ id: schema.flows.id, name: schema.flows.name, status: schema.flows.status })
      .from(schema.flows)
      .where(and(eq(schema.flows.id, flowId), eq(schema.flows.workspaceId, workspaceId)))
      .limit(1),
    db
      .select()
      .from(schema.flowRuns)
      .where(and(eq(schema.flowRuns.flowId, flowId), eq(schema.flowRuns.workspaceId, workspaceId)))
      .orderBy(desc(schema.flowRuns.createdAt))
      .limit(30),
  ])

  const flow = flowRows[0]
  if (!flow) redirect(`/workspace/${workspaceId}/flows`)

  const selectedRun = selectedRunId ? flowRuns.find(r => r.id === selectedRunId) : null

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href={`/workspace/${workspaceId}/flows/${flowId}`}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Flow
        </Link>
        <span className="text-gray-700">/</span>
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-gray-600" />
          <span className="text-sm text-gray-300 font-medium">{flow.name}</span>
          <span className="text-gray-700">/</span>
          <span className="text-sm text-gray-500">Runs</span>
        </div>
      </div>

      <div className="flex gap-4">
        {/* Run list */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-300">
              {flowRuns.length} run{flowRuns.length !== 1 ? 's' : ''}
            </h2>
          </div>

          {flowRuns.length === 0 ? (
            <Empty
              icon={<GitBranch className="w-8 h-8" />}
              title="No runs yet"
              description="Trigger this flow to see run history here"
            />
          ) : (
            <div className="space-y-1.5">
              {flowRuns.map(run => {
                const nodeCount = Object.keys(run.nodeStates ?? {}).length
                const isSelected = run.id === selectedRunId
                return (
                  <Link
                    key={run.id}
                    href={`/workspace/${workspaceId}/flows/${flowId}/runs?runId=${run.id}`}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                      isSelected
                        ? 'bg-brand-500/10 border-brand-500/30'
                        : 'bg-white/3 border-white/7 hover:border-white/12'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Badge status={run.status} />
                        <span className="text-xs text-gray-600 font-mono truncate">{run.id}</span>
                      </div>
                      <p className="text-xs text-gray-500">
                        {nodeCount} node{nodeCount !== 1 ? 's' : ''} ·{' '}
                        {formatRelative(run.createdAt)}
                      </p>
                    </div>
                    <p className="text-xs text-gray-600 shrink-0 hidden md:block">
                      {formatDate(run.createdAt)}
                    </p>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Node state detail panel */}
        {selectedRun && (
          <div className="w-80 shrink-0">
            <div className="bg-white/3 border border-white/7 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-white/7">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-200">Node States</h3>
                  <Badge status={selectedRun.status} />
                </div>
                <p className="text-xs text-gray-600 mt-1 font-mono">{selectedRun.id}</p>
              </div>

              <div className="p-3 space-y-2">
                {Object.keys(selectedRun.nodeStates ?? {}).length === 0 ? (
                  <p className="text-xs text-gray-600 px-1 py-2">No node states recorded yet</p>
                ) : (
                  Object.entries(selectedRun.nodeStates ?? {}).map(([nodeId, state]) => (
                    <div
                      key={nodeId}
                      className="bg-white/3 border border-white/7 rounded-lg px-3 py-2.5"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="text-xs font-medium text-gray-300 truncate">{nodeId}</p>
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded border font-medium ${statusBg(state.status)}`}
                        >
                          {state.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                      {state.runId && (
                        <Link
                          href={`/workspace/${workspaceId}/agents`}
                          className="text-xs text-brand-400 hover:text-brand-300 font-mono transition-colors"
                        >
                          {state.runId}
                        </Link>
                      )}
                      {state.errorMessage && (
                        <p className="text-xs text-red-400 mt-1 truncate" title={state.errorMessage}>
                          {state.errorMessage}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div className="px-4 py-3 border-t border-white/7">
                <p className="text-xs text-gray-600">
                  Started {formatRelative(selectedRun.createdAt)}
                </p>
                {selectedRun.completedAt && (
                  <p className="text-xs text-gray-600">
                    Completed {formatDate(selectedRun.completedAt)}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

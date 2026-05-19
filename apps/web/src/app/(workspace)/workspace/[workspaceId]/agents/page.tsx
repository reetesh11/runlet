import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { eq, desc } from 'drizzle-orm'
import { createDb, schema } from '@/lib/db'
import { formatRelative } from '@/lib/utils'
import Link from 'next/link'
import { Bot, Plus, Play, Settings, Zap, Store } from 'lucide-react'

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  saved_draft: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  paused: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  error: 'bg-red-500/10 text-red-400 border-red-500/20',
}

export default async function AgentsPage({ params }: { params: { workspaceId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const { workspaceId } = params
  const db = createDb()

  // Get deployed agents
  const deployedRows = await db
    .select({ deployment: schema.deployments, agent: schema.agents })
    .from(schema.deployments)
    .innerJoin(schema.agents, eq(schema.deployments.agentId, schema.agents.id))
    .where(eq(schema.deployments.workspaceId, workspaceId))
    .orderBy(desc(schema.deployments.updatedAt))

  // Get installed but not yet deployed agents
  const installedRows = await db
    .select({ wa: schema.workspaceAgents, agent: schema.agents })
    .from(schema.workspaceAgents)
    .innerJoin(schema.agents, eq(schema.workspaceAgents.agentId, schema.agents.id))
    .where(eq(schema.workspaceAgents.workspaceId, workspaceId))

  // Filter out agents that already have deployments
  const deployedAgentIds = new Set(deployedRows.map(r => r.agent.id))
  const undeployedInstalls = installedRows.filter(r => !deployedAgentIds.has(r.agent.id))

  const isEmpty = deployedRows.length === 0 && undeployedInstalls.length === 0

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Agents</h1>
          <p className="text-sm text-gray-500">
            {deployedRows.length} deployed · {undeployedInstalls.length} awaiting configuration
          </p>
        </div>
        <Link href="/marketplace"
          className="flex items-center gap-2 px-3 py-2 bg-brand-500 hover:bg-brand-400 text-white text-sm font-medium rounded-xl transition-colors">
          <Plus className="w-3.5 h-3.5" /> Add Agent
        </Link>
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white/3 border border-white/7 flex items-center justify-center mb-4">
            <Bot className="w-8 h-8 text-gray-700" />
          </div>
          <h3 className="text-sm font-medium text-gray-400 mb-1">No agents yet</h3>
          <p className="text-xs text-gray-600 mb-4">Browse the marketplace to find and deploy agents for your team</p>
          <Link href="/marketplace"
            className="flex items-center gap-2 px-3 py-2 bg-brand-500 hover:bg-brand-400 text-white text-sm font-medium rounded-xl transition-colors">
            <Store className="w-3.5 h-3.5" /> Browse Marketplace
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Installed but not configured */}
          {undeployedInstalls.length > 0 && (
            <div className="mb-2">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2 px-1">
                Awaiting configuration
              </p>
              {undeployedInstalls.map(({ wa, agent }) => (
                <div key={wa.id}
                  className="flex items-center gap-4 bg-amber-500/5 border border-amber-500/15 rounded-xl px-4 py-3 mb-2">
                  <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">{agent.displayName}</p>
                    <p className="text-xs text-gray-500">Installed but not configured yet</p>
                  </div>
                  <Link
                    href={`/workspace/${workspaceId}/agents/new/configure?agentId=${agent.id}&versionId=${agent.latestPublishedVersionId}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/20 text-amber-400 text-xs font-medium rounded-lg transition-colors">
                    <Zap className="w-3 h-3" /> Configure
                  </Link>
                </div>
              ))}
            </div>
          )}

          {/* Deployed agents */}
          {deployedRows.length > 0 && (
            <div>
              {undeployedInstalls.length > 0 && (
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2 px-1">
                  Deployed
                </p>
              )}
              {deployedRows.map(({ deployment, agent }) => (
                <div key={deployment.id}
                  className="flex items-center gap-4 bg-white/3 border border-white/7 hover:border-white/12 rounded-xl px-4 py-3 mb-2 transition-colors">
                  <div className="w-9 h-9 rounded-lg bg-brand-500/10 flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-brand-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-white truncate">{deployment.instanceName}</p>
                      <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${STATUS_COLORS[deployment.status] ?? 'bg-gray-500/10 text-gray-400 border-gray-500/20'}`}>
                        {deployment.status.replace('_', ' ')}
                      </span>
                      {deployment.deploymentEnv === 'sandbox' && (
                        <span className="text-xs px-1.5 py-0.5 bg-amber-500/10 text-amber-400 rounded border border-amber-500/20">sandbox</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 truncate">{agent.displayName}</p>
                  </div>
                  <div className="text-right shrink-0 hidden md:block">
                    <p className="text-xs text-gray-400">{deployment.runCount} runs</p>
                    <p className="text-xs text-gray-600">{formatRelative(deployment.lastRunAt ?? deployment.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Link href={`/workspace/${workspaceId}/agents/${deployment.id}/runs`}
                      className="p-1.5 rounded-lg text-gray-600 hover:text-gray-300 hover:bg-white/5 transition-colors" title="View runs">
                      <Play className="w-3.5 h-3.5" />
                    </Link>
                    <Link href={`/workspace/${workspaceId}/agents/${deployment.id}/configure`}
                      className="p-1.5 rounded-lg text-gray-600 hover:text-gray-300 hover:bg-white/5 transition-colors" title="Edit config">
                      <Settings className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { redirect } from 'next/navigation'
import { eq, desc } from 'drizzle-orm'
import { createDb, schema } from '@/lib/db'
import { Badge, Button, Empty } from '@/components/ui'
import { formatRelative } from '@/lib/utils'
import { Bot, Plus, Play, Settings } from 'lucide-react'
import Link from 'next/link'

export default async function AgentsPage({ params }: { params: { workspaceId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const { workspaceId } = params
  const db = createDb()

  const rows = await db
    .select({ deployment: schema.deployments, agent: schema.agents })
    .from(schema.deployments)
    .innerJoin(schema.agents, eq(schema.deployments.agentId, schema.agents.id))
    .where(eq(schema.deployments.workspaceId, workspaceId))
    .orderBy(desc(schema.deployments.updatedAt))

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Deployed Agents</h1>
          <p className="text-sm text-gray-500">{rows.length} agent{rows.length !== 1 ? 's' : ''} configured</p>
        </div>
        <Link href="/marketplace">
          <Button size="sm"><Plus className="w-3.5 h-3.5" /> Add Agent</Button>
        </Link>
      </div>

      {rows.length === 0 ? (
        <Empty
          icon={<Bot className="w-10 h-10" />}
          title="No agents deployed yet"
          description="Browse the marketplace to find and deploy agents for your team."
          action={
            <Link href="/marketplace">
              <Button size="sm"><Plus className="w-3.5 h-3.5" /> Browse Marketplace</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-2">
          {rows.map(({ deployment, agent }) => (
            <div key={deployment.id} className="bg-white/3 border border-white/7 rounded-xl px-4 py-3 flex items-center gap-4">
              <div className="w-9 h-9 rounded-lg bg-brand-500/15 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-brand-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-white truncate">{deployment.instanceName}</p>
                  <Badge status={deployment.status} />
                  {deployment.deploymentEnv === 'sandbox' && (
                    <span className="text-xs px-1.5 py-0.5 bg-amber-500/10 text-amber-400 rounded border border-amber-500/20">sandbox</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 truncate">{agent.displayName} · {agent.tagline}</p>
              </div>
              <div className="text-right shrink-0 hidden md:block">
                <p className="text-xs text-gray-400">{deployment.runCount} runs</p>
                <p className="text-xs text-gray-600">{formatRelative(deployment.lastRunAt ?? deployment.createdAt)}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Link href={`/workspace/${workspaceId}/agents/${deployment.id}/runs`}>
                  <Button variant="ghost" size="sm"><Play className="w-3.5 h-3.5" /></Button>
                </Link>
                <Link href={`/workspace/${workspaceId}/agents/${deployment.id}/configure`}>
                  <Button variant="ghost" size="sm"><Settings className="w-3.5 h-3.5" /></Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

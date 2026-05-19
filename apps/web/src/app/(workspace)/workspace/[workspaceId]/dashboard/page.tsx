import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '@runlet/db'
import { eq, and, desc, sql, gte } from 'drizzle-orm'
import { StatCard } from '@/components/ui'
import { RecentRunsList } from './recent-runs'
import { Bot, GitBranch, Plug, Activity, TrendingUp, CheckCircle } from 'lucide-react'
import Link from 'next/link'

function createDb() {
  const client = postgres(process.env.DATABASE_URL!, { prepare: false })
  return drizzle(client, { schema })
}

export default async function DashboardPage({ params }: { params: { workspaceId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const { workspaceId } = params
  const db = createDb()
  const since24h = new Date(Date.now() - 86_400_000)

  const [deploymentCount, connectorCount, flowCount, runStats, recentRuns] = await Promise.all([
    db.select({ count: sql<number>`count(*)` })
      .from(schema.deployments)
      .where(and(
        eq(schema.deployments.workspaceId, workspaceId),
        eq(schema.deployments.status, 'active')
      )),
    db.select({ count: sql<number>`count(*)` })
      .from(schema.connectors)
      .where(eq(schema.connectors.workspaceId, workspaceId)),
    db.select({ count: sql<number>`count(*)` })
      .from(schema.flows)
      .where(and(
        eq(schema.flows.workspaceId, workspaceId),
        eq(schema.flows.status, 'active')
      )),
    db.select({
      total: sql<number>`count(*)`,
      success: sql<number>`count(*) filter (where status = 'success')`,
      failed: sql<number>`count(*) filter (where status = 'failed')`,
      tokens: sql<number>`sum(llm_tokens_used)`,
    }).from(schema.runs).where(and(
      eq(schema.runs.workspaceId, workspaceId),
      gte(schema.runs.createdAt, since24h)
    )),
    db.select().from(schema.runs)
      .where(eq(schema.runs.workspaceId, workspaceId))
      .orderBy(desc(schema.runs.createdAt))
      .limit(10),
  ])

  const stats = runStats[0]!
  const successRate = Number(stats.total) > 0
    ? Math.round((Number(stats.success) / Number(stats.total)) * 100)
    : 0

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Dashboard</h1>
        <p className="text-sm text-gray-500">Last 24 hours activity</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
        <StatCard label="Active Agents" value={Number(deploymentCount[0]?.count ?? 0)} icon={<Bot className="w-5 h-5" />} />
        <StatCard label="Connectors" value={Number(connectorCount[0]?.count ?? 0)} icon={<Plug className="w-5 h-5" />} color="text-teal-400" />
        <StatCard label="Active Flows" value={Number(flowCount[0]?.count ?? 0)} icon={<GitBranch className="w-5 h-5" />} color="text-amber-400" />
        <StatCard label="Runs (24h)" value={Number(stats.total)} icon={<Activity className="w-5 h-5" />} color="text-blue-400" />
        <StatCard label="Success Rate" value={`${successRate}%`} icon={<CheckCircle className="w-5 h-5" />} color={successRate > 80 ? 'text-emerald-400' : 'text-amber-400'} />
        <StatCard label="Tokens Used" value={stats.tokens ? `${Math.round(Number(stats.tokens) / 1000)}k` : '0'} icon={<TrendingUp className="w-5 h-5" />} color="text-purple-400" />
      </div>

      <div className="bg-white/3 border border-white/7 rounded-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/7">
          <h2 className="text-sm font-semibold text-gray-200">Recent Runs</h2>
          <Link href={`/workspace/${workspaceId}/agents`} className="text-xs text-brand-400 hover:text-brand-300">
            View all →
          </Link>
        </div>
        <RecentRunsList runs={recentRuns} workspaceId={workspaceId} />
      </div>
    </div>
  )
}

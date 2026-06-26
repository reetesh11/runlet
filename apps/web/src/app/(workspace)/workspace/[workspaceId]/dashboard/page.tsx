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

// ── Helpers ────────────────────────────────────────────────────
function getDayLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

interface DayBucket {
  label: string
  date: string // YYYY-MM-DD
  success: number
  failed: number
  total: number
}

function RunTrendChart({ days }: { days: DayBucket[] }) {
  const maxTotal = Math.max(...days.map(d => d.total), 1)

  return (
    <div className="bg-white/3 border border-white/7 rounded-xl p-4 mt-3">
      <h2 className="text-sm font-semibold text-gray-200 mb-4">7-Day Run Trend</h2>
      <div className="flex items-end gap-2 h-28">
        {days.map(day => {
          const successPct = Math.round((day.success / maxTotal) * 100)
          const failedPct = Math.round((day.failed / maxTotal) * 100)
          const emptyPct = 100 - successPct - failedPct

          return (
            <div key={day.date} className="flex-1 flex flex-col items-center gap-1 group">
              {/* Tooltip */}
              <div className="opacity-0 group-hover:opacity-100 transition-opacity text-center mb-1">
                <p className="text-xs text-gray-300 font-medium whitespace-nowrap">{day.total} runs</p>
                {day.success > 0 && (
                  <p className="text-xs text-emerald-400">{day.success} ok</p>
                )}
                {day.failed > 0 && (
                  <p className="text-xs text-red-400">{day.failed} failed</p>
                )}
              </div>
              {/* Stacked bar */}
              <div className="w-full flex flex-col justify-end" style={{ height: '72px' }}>
                {failedPct > 0 && (
                  <div
                    className="w-full bg-red-500/70 rounded-t-sm"
                    style={{ height: `${failedPct}%` }}
                    title={`${day.failed} failed`}
                  />
                )}
                {successPct > 0 && (
                  <div
                    className={`w-full bg-emerald-500/70 ${failedPct === 0 ? 'rounded-t-sm' : ''}`}
                    style={{ height: `${successPct}%` }}
                    title={`${day.success} success`}
                  />
                )}
                {day.total === 0 && (
                  <div className="w-full bg-white/5 rounded-sm" style={{ height: '4px' }} />
                )}
              </div>
              {/* Day label */}
              <p className="text-xs text-gray-600 truncate w-full text-center mt-1">
                {day.label.split(' ')[0]}
              </p>
            </div>
          )
        })}
      </div>
      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-white/5">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-emerald-500/70" />
          <span className="text-xs text-gray-500">Success</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-red-500/70" />
          <span className="text-xs text-gray-500">Failed</span>
        </div>
      </div>
    </div>
  )
}

export default async function DashboardPage({ params }: { params: { workspaceId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const { workspaceId } = params
  const db = createDb()
  const since24h = new Date(Date.now() - 86_400_000)
  const since7d = new Date(Date.now() - 7 * 86_400_000)

  const [deploymentCount, connectorCount, flowCount, runStats, recentRuns, trendRows] = await Promise.all([
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
    db.select({
      day: sql<string>`to_char(created_at, 'YYYY-MM-DD')`,
      success: sql<number>`count(*) filter (where status = 'success')`,
      failed: sql<number>`count(*) filter (where status = 'failed')`,
      total: sql<number>`count(*)`,
    })
      .from(schema.runs)
      .where(and(
        eq(schema.runs.workspaceId, workspaceId),
        gte(schema.runs.createdAt, since7d)
      ))
      .groupBy(sql`to_char(created_at, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(created_at, 'YYYY-MM-DD')`),
  ])

  const stats = runStats[0]!
  const successRate = Number(stats.total) > 0
    ? Math.round((Number(stats.success) / Number(stats.total)) * 100)
    : 0

  // Build last-7-days buckets (always 7 entries)
  const trendMap = new Map(trendRows.map(r => [r.day, r]))
  const trendDays: DayBucket[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 86_400_000)
    const key = d.toISOString().slice(0, 10)
    const row = trendMap.get(key)
    return {
      label: getDayLabel(d),
      date: key,
      success: Number(row?.success ?? 0),
      failed: Number(row?.failed ?? 0),
      total: Number(row?.total ?? 0),
    }
  })

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

      <RunTrendChart days={trendDays} />

      <div className="bg-white/3 border border-white/7 rounded-xl mt-3">
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

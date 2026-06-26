import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { eq, desc } from 'drizzle-orm'
import { createDb, schema } from '@/lib/db'
import { Badge, Button, Empty } from '@/components/ui'
import { formatRelative } from '@/lib/utils'
import { GitBranch, Plus, Sparkles } from 'lucide-react'
import Link from 'next/link'

export default async function FlowsPage({ params }: { params: { workspaceId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const { workspaceId } = params
  const db = createDb()

  const all = await db.select().from(schema.flows)
    .where(eq(schema.flows.workspaceId, workspaceId))
    .orderBy(desc(schema.flows.updatedAt))

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Flows</h1>
          <p className="text-sm text-gray-500">Multi-agent pipelines</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/workspace/${workspaceId}/flows/templates`}>
            <Button size="sm" variant="secondary"><Sparkles className="w-3.5 h-3.5" /> Templates</Button>
          </Link>
          <Link href={`/workspace/${workspaceId}/flows/new`}>
            <Button size="sm"><Plus className="w-3.5 h-3.5" /> New Flow</Button>
          </Link>
        </div>
      </div>

      {all.length === 0 ? (
        <Empty
          icon={<GitBranch className="w-10 h-10" />}
          title="No flows yet"
          description="Connect multiple agents into a pipeline with conditional routing."
          action={
            <Link href={`/workspace/${workspaceId}/flows/new`}>
              <Button size="sm"><Plus className="w-3.5 h-3.5" /> Create Flow</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-2">
          {all.map(flow => (
            <Link
              key={flow.id}
              href={`/workspace/${workspaceId}/flows/${flow.id}`}
              className="flex items-center gap-4 bg-white/3 border border-white/7 hover:border-white/12 rounded-xl px-4 py-3 transition-colors"
            >
              <div className="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
                <GitBranch className="w-4 h-4 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-white">{flow.name}</p>
                  <Badge status={flow.status} />
                </div>
                {flow.description && (
                  <p className="text-xs text-gray-500 truncate">{flow.description}</p>
                )}
                <p className="text-xs text-gray-600">
                  {(flow.graphDef as { nodes?: unknown[] })?.nodes?.length ?? 0} nodes
                </p>
              </div>
              <p className="text-xs text-gray-600 shrink-0">{formatRelative(flow.updatedAt)}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

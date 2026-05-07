'use client'
import Link from 'next/link'
import { Badge } from '@/components/ui'
import { formatRelative, formatDuration } from '@/lib/utils'

interface Run {
  id: string
  deploymentId: string | null
  status: string
  triggerType: string
  durationMs: number | null
  createdAt: Date
  llmTokensUsed: number | null
}

export function RecentRunsList({ runs, workspaceId }: { runs: Run[]; workspaceId: string }) {
  if (!runs.length) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-gray-600">No runs yet — activate an agent to get started</p>
      </div>
    )
  }
  return (
    <div className="divide-y divide-white/5">
      {runs.map(run => (
        <Link key={run.id}
          href={run.deploymentId ? `/workspace/${workspaceId}/agents/${run.deploymentId}/runs?runId=${run.id}` : '#'}
          className="flex items-center gap-4 px-4 py-3 hover:bg-white/3 transition-colors">
          <Badge status={run.status} />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-mono text-gray-400 truncate">{run.id}</p>
            <p className="text-xs text-gray-600">{run.triggerType.replace(/_/g, ' ')}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-gray-400">{formatDuration(run.durationMs)}</p>
            <p className="text-xs text-gray-600">{formatRelative(run.createdAt)}</p>
          </div>
        </Link>
      ))}
    </div>
  )
}

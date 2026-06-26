'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Textarea } from '@/components/ui'
import { CheckCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { formatDate, formatRelative } from '@/lib/utils'

interface PendingRun {
  id: string
  deploymentId: string | null
  confidenceScore: number | null
  createdAt: Date
  agentName: string
  deploymentName: string
}

interface ReviewClientProps {
  pendingRuns: PendingRun[]
  workspaceId: string
}

function ConfidenceBar({ score }: { score: number | null }) {
  if (score === null) {
    return <span className="text-xs text-gray-600">—</span>
  }
  const pct = Math.round(score * 100)
  const color =
    pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500'
  const textColor =
    pct >= 80 ? 'text-emerald-400' : pct >= 60 ? 'text-amber-400' : 'text-red-400'
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-medium ${textColor}`}>{pct}%</span>
    </div>
  )
}

function RunReviewCard({
  run,
  workspaceId,
}: {
  run: PendingRun
  workspaceId: string
}) {
  const [expanded, setExpanded] = useState(false)
  const [notes, setNotes] = useState('')
  const [isPending, startTransition] = useTransition()
  const [done, setDone] = useState<'approved' | 'rejected' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleDecision(decision: 'approved' | 'rejected') {
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/v1/runs/${run.id}/review`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'X-Workspace-Id': workspaceId,
          },
          body: JSON.stringify({ decision, notes }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: string }
          throw new Error(body.error ?? `Request failed with status ${res.status}`)
        }
        setDone(decision)
        setTimeout(() => router.refresh(), 800)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  if (done) {
    return (
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
        done === 'approved'
          ? 'bg-emerald-500/5 border-emerald-500/20'
          : 'bg-red-500/5 border-red-500/20'
      }`}>
        {done === 'approved' ? (
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
        ) : (
          <XCircle className="w-4 h-4 text-red-400 shrink-0" />
        )}
        <p className="text-sm text-gray-400 capitalize">{done} — refreshing...</p>
      </div>
    )
  }

  return (
    <div className="bg-white/3 border border-white/7 rounded-xl overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-sm font-medium text-white truncate">{run.deploymentName}</p>
            <span className="text-xs text-gray-600">·</span>
            <p className="text-xs text-gray-500 truncate">{run.agentName}</p>
          </div>
          <div className="flex items-center gap-3">
            <ConfidenceBar score={run.confidenceScore} />
            <span className="text-xs text-gray-600">{formatRelative(run.createdAt)}</span>
          </div>
        </div>

        <button
          onClick={() => setExpanded(e => !e)}
          className="p-1.5 rounded-lg text-gray-600 hover:text-gray-300 hover:bg-white/5 transition-colors"
        >
          {expanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-white/7 pt-3 space-y-3">
          <div className="text-xs text-gray-500 font-mono bg-white/3 rounded-lg px-3 py-2">
            Run ID: {run.id}
          </div>

          <Textarea
            label="Review notes (optional)"
            placeholder="Add context for this decision..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
          />

          {error && (
            <p className="text-xs text-red-400 px-1">{error}</p>
          )}

          <div className="flex items-center gap-2 pt-1">
            <Button
              variant="primary"
              size="sm"
              loading={isPending}
              onClick={() => handleDecision('approved')}
              className="flex-1 justify-center"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              Approve
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={isPending}
              onClick={() => handleDecision('rejected')}
              className="flex-1 justify-center"
            >
              <XCircle className="w-3.5 h-3.5" />
              Reject
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export function ReviewClient({ pendingRuns, workspaceId }: ReviewClientProps) {
  return (
    <div className="space-y-2">
      {pendingRuns.map(run => (
        <RunReviewCard key={run.id} run={run} workspaceId={workspaceId} />
      ))}
    </div>
  )
}

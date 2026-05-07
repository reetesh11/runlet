'use client'
import { useState, useEffect } from 'react'
import { Badge } from '@/components/ui'
import { formatDate, formatDuration } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { CheckCircle2, XCircle, AlertTriangle, Clock, Cpu, Zap, Shield, Database } from 'lucide-react'

interface AuditEvent {
  id: string
  eventType: string
  occurredAt: Date
  actor: { type: string; id?: string }
  guardrailResults?: Array<{ type: string; passed: boolean; reason?: string; actionTaken?: string }>
  llmMetadata?: { modelId: string; provider: string; promptTokens: number; completionTokens: number; latencyMs: number; confidenceScore?: number }
  connectorCall?: { provider: string; actionPrimitive: string; responseStatus: number; latencyMs: number }
  metadata?: Record<string, unknown>
}

interface Run {
  id: string
  status: string
  triggerType: string
  durationMs: number | null
  llmTokensUsed: number | null
  llmCostUsd: number | null
  confidenceScore: number | null
  errorMessage: string | null
  createdAt: Date
  startedAt: Date | null
  completedAt: Date | null
}

const EVENT_ICONS: Record<string, React.ReactNode> = {
  run_queued: <Clock className="w-3.5 h-3.5" />,
  run_started: <Zap className="w-3.5 h-3.5" />,
  guardrail_evaluated: <Shield className="w-3.5 h-3.5" />,
  llm_called: <Cpu className="w-3.5 h-3.5" />,
  action_executed: <Zap className="w-3.5 h-3.5" />,
  human_review_requested: <AlertTriangle className="w-3.5 h-3.5" />,
  run_completed: <CheckCircle2 className="w-3.5 h-3.5" />,
  run_failed: <XCircle className="w-3.5 h-3.5" />,
}

const EVENT_COLORS: Record<string, string> = {
  run_queued: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  run_started: 'bg-brand-500/10 text-brand-400 border-brand-500/20',
  guardrail_evaluated: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  llm_called: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  action_executed: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
  human_review_requested: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  run_completed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  run_failed: 'bg-red-500/10 text-red-400 border-red-500/20',
}

export function RunTrace({ run, events }: { run: Run; events: AuditEvent[] }) {
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      {/* Run summary */}
      <div className="bg-white/3 border border-white/7 rounded-xl p-4">
        <div className="flex items-center justify-between gap-4 mb-3">
          <div className="flex items-center gap-2">
            <Badge status={run.status} />
            <span className="text-xs font-mono text-gray-500">{run.id}</span>
          </div>
          <span className="text-xs text-gray-600">{formatDate(run.createdAt)}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div><p className="text-xs text-gray-600">Duration</p><p className="text-sm font-medium text-white">{formatDuration(run.durationMs)}</p></div>
          <div><p className="text-xs text-gray-600">Tokens</p><p className="text-sm font-medium text-white">{run.llmTokensUsed?.toLocaleString() ?? '—'}</p></div>
          <div><p className="text-xs text-gray-600">Confidence</p><p className="text-sm font-medium text-white">{run.confidenceScore != null ? `${Math.round(run.confidenceScore * 100)}%` : '—'}</p></div>
          <div><p className="text-xs text-gray-600">Cost</p><p className="text-sm font-medium text-white">{run.llmCostUsd != null ? `$${run.llmCostUsd.toFixed(4)}` : '—'}</p></div>
        </div>
        {run.errorMessage && (
          <div className="mt-3 p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-xs text-red-400 font-mono">{run.errorMessage}</p>
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-[18px] top-0 bottom-0 w-px bg-white/5" />

        <div className="space-y-2">
          {events.map((event, idx) => (
            <div key={event.id} className="relative flex gap-3">
              {/* Icon */}
              <div className={cn('relative z-10 w-9 h-9 shrink-0 rounded-full border flex items-center justify-center',
                EVENT_COLORS[event.eventType] ?? 'bg-gray-500/10 text-gray-400 border-gray-500/20')}>
                {EVENT_ICONS[event.eventType] ?? <Database className="w-3.5 h-3.5" />}
              </div>

              {/* Content */}
              <button
                onClick={() => setExpanded(expanded === event.id ? null : event.id)}
                className="flex-1 text-left bg-white/3 hover:bg-white/5 border border-white/7 hover:border-white/10 rounded-xl p-3 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-gray-200">{event.eventType.replace(/_/g, ' ')}</p>
                    <EventSummary event={event} />
                  </div>
                  <span className="text-xs text-gray-600 shrink-0">{formatDate(event.occurredAt)}</span>
                </div>

                {/* Expanded details */}
                {expanded === event.id && (
                  <div className="mt-3 pt-3 border-t border-white/7">
                    <EventDetails event={event} />
                  </div>
                )}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function EventSummary({ event }: { event: AuditEvent }) {
  if (event.llmMetadata) {
    return <p className="text-xs text-gray-600">{event.llmMetadata.modelId} · {event.llmMetadata.promptTokens + event.llmMetadata.completionTokens} tokens · {event.llmMetadata.latencyMs}ms</p>
  }
  if (event.connectorCall) {
    return <p className="text-xs text-gray-600">{event.connectorCall.provider}.{event.connectorCall.actionPrimitive} · {event.connectorCall.responseStatus} · {event.connectorCall.latencyMs}ms</p>
  }
  if (event.guardrailResults) {
    const blocked = event.guardrailResults.filter(r => !r.passed).length
    return <p className="text-xs text-gray-600">{event.guardrailResults.length} checks · {blocked > 0 ? `${blocked} blocked` : 'all passed'}</p>
  }
  return null
}

function EventDetails({ event }: { event: AuditEvent }) {
  if (event.guardrailResults) {
    return (
      <div className="space-y-1.5">
        {event.guardrailResults.map((r, i) => (
          <div key={i} className={cn('flex items-start gap-2 text-xs p-2 rounded-lg',
            r.passed ? 'bg-emerald-500/5 text-emerald-400' : 'bg-red-500/5 text-red-400')}>
            {r.passed ? <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0" /> : <XCircle className="w-3 h-3 mt-0.5 shrink-0" />}
            <div>
              <p className="font-medium">{r.type}</p>
              {r.reason && <p className="opacity-70">{r.reason}</p>}
            </div>
          </div>
        ))}
      </div>
    )
  }
  if (event.llmMetadata) {
    return (
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="bg-white/3 rounded-lg p-2"><p className="text-gray-600">Model</p><p className="text-gray-200">{event.llmMetadata.modelId}</p></div>
        <div className="bg-white/3 rounded-lg p-2"><p className="text-gray-600">Tokens</p><p className="text-gray-200">{event.llmMetadata.promptTokens}+{event.llmMetadata.completionTokens}</p></div>
        <div className="bg-white/3 rounded-lg p-2"><p className="text-gray-600">Confidence</p><p className="text-gray-200">{event.llmMetadata.confidenceScore != null ? `${Math.round(event.llmMetadata.confidenceScore * 100)}%` : '—'}</p></div>
      </div>
    )
  }
  if (event.metadata) {
    return <pre className="text-xs text-gray-500 font-mono overflow-x-auto">{JSON.stringify(event.metadata, null, 2)}</pre>
  }
  return null
}

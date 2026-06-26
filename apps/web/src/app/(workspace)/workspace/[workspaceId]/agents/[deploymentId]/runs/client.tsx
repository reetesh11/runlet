'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    ArrowLeft, Play, RefreshCw, Clock, Cpu, Shield,
    Zap, CheckCircle2, XCircle, AlertTriangle, Database,
    Activity, Copy, CheckCircle, FileText, ChevronDown, ChevronRight
} from 'lucide-react'
import { Badge } from '@/components/ui'
import { cn, formatDate, formatRelative, formatDuration, formatTokens } from '@/lib/utils'

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

interface AuditEvent {
    id: string
    eventType: string
    occurredAt: Date
    actor: { type: string; id?: string }
    guardrailResults?: Array<{ type: string; passed: boolean; reason?: string; actionTaken?: string }> | null
    llmMetadata?: { modelId: string; provider: string; promptTokens: number; completionTokens: number; latencyMs: number; confidenceScore?: number } | null
    connectorCall?: { provider: string; actionPrimitive: string; responseStatus: number; latencyMs: number } | null
    metadata?: Record<string, unknown> | null
}

interface Deployment {
    id: string
    instanceName: string
    status: string
    webhookUrl?: string | null
}

interface Agent {
    id: string
    displayName: string
    slug: string
}

interface Props {
    workspaceId: string
    deployment: Deployment
    agent: Agent | null
    runs: Run[]
    selectedRun: Run | null
    selectedRunEvents: AuditEvent[]
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

export function RunsClient({ workspaceId, deployment, agent, runs, selectedRun: initialRun, selectedRunEvents: initialEvents }: Props) {
    const router = useRouter()
    const [selectedRun, setSelectedRun] = useState(initialRun)
    const [events, setEvents] = useState(initialEvents)
    const [expanded, setExpanded] = useState<string | null>(null)
    const [triggering, setTriggering] = useState(false)
    const [triggerPayload, setTriggerPayload] = useState('{\n  "days": 7,\n  "max_messages": 10\n}')
    const [showTrigger, setShowTrigger] = useState(false)
    const [webhookCopied, setWebhookCopied] = useState(false)
    const [outputPayload, setOutputPayload] = useState<Record<string, unknown> | null>(null)
    const [loadingOutput, setLoadingOutput] = useState(false)
    const [showOutput, setShowOutput] = useState(true)

    async function handleSelectRun(run: Run) {
        setSelectedRun(run)
        setOutputPayload(null)
        // Fetch events for this run
        const resp = await fetch(`/api/v1/workspaces/${workspaceId}/runs/${run.id}/audit`)
        if (resp.ok) {
            const data = await resp.json() as { data: AuditEvent[] }
            setEvents(data.data)
        }
        // Auto-load output for completed runs
        if (run.status === 'success') {
            loadOutput(run.id)
        }
    }

    async function loadOutput(runId: string) {
        setLoadingOutput(true)
        try {
            const resp = await fetch(`/api/v1/workspaces/${workspaceId}/runs/${runId}/payload?type=output`)
            if (resp.ok) {
                const data = await resp.json() as { data: Record<string, unknown> }
                setOutputPayload(data.data)
            }
        } finally {
            setLoadingOutput(false)
        }
    }

    async function handleTrigger() {
        setTriggering(true)
        try {
            const token = document.cookie.split(';').find(c => c.trim().startsWith('next-auth.session-token='))?.split('=').slice(1).join('=') ?? ''
            const payload = JSON.parse(triggerPayload)
            const resp = await fetch(
                `/api/v1/workspaces/${workspaceId}/deployments/${deployment.id}/runs`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Workspace-Id': workspaceId,
                    },
                    body: JSON.stringify({ input: payload, executionMode: 'async', priority: 'standard' }),
                }
            )
            if (resp.ok) {
                setShowTrigger(false)
                // Refresh after 2 seconds
                setTimeout(() => router.refresh(), 2000)
            }
        } catch (err) {
            console.error('Trigger failed:', err)
        } finally {
            setTriggering(false)
        }
    }

    async function copyWebhook() {
        await navigator.clipboard.writeText(deployment.webhookUrl ?? '')
        setWebhookCopied(true)
        setTimeout(() => setWebhookCopied(false), 2000)
    }

    return (
        <div className="flex h-screen overflow-hidden">
            {/* Left panel — runs list */}
            <div className="w-80 shrink-0 border-r border-white/7 flex flex-col">
                {/* Header */}
                <div className="px-4 py-3 border-b border-white/7">
                    <div className="flex items-center gap-2 mb-2">
                        <button onClick={() => router.push(`/workspace/${workspaceId}/agents`)}
                            className="text-gray-600 hover:text-gray-400 transition-colors">
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{deployment.instanceName}</p>
                            <p className="text-xs text-gray-600">{agent?.displayName}</p>
                        </div>
                        <Badge status={deployment.status} />
                    </div>

                    {/* Webhook URL */}
                    {deployment.webhookUrl && (
                        <div className="flex items-center gap-1.5 mt-2">
                            <code className="flex-1 text-xs font-mono text-gray-600 truncate">
                                {deployment.webhookUrl.replace('http://localhost:3001', '')}
                            </code>
                            <button onClick={copyWebhook} className="text-gray-600 hover:text-gray-400 shrink-0">
                                {webhookCopied ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                        </div>
                    )}

                    <div className="flex items-center gap-2 mt-2">
                        <button onClick={() => setShowTrigger(!showTrigger)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs bg-brand-500/10 hover:bg-brand-500/15 text-brand-400 border border-brand-500/20 rounded-lg transition-colors">
                            <Play className="w-3 h-3" /> Test Run
                        </button>
                        <button onClick={() => router.refresh()}
                            className="p-1.5 text-gray-600 hover:text-gray-400 transition-colors">
                            <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                {/* Test trigger form */}
                {showTrigger && (
                    <div className="px-3 py-3 border-b border-white/7 bg-white/2">
                        <p className="text-xs font-medium text-gray-400 mb-2">Test Payload (JSON)</p>
                        <textarea
                            className="w-full text-xs font-mono bg-black/30 border border-white/10 rounded-lg p-2 text-gray-300 focus:outline-none focus:border-brand-500/50 resize-none"
                            rows={6}
                            value={triggerPayload}
                            onChange={e => setTriggerPayload(e.target.value)}
                        />
                        <button
                            onClick={handleTrigger}
                            disabled={triggering}
                            className="w-full mt-2 py-1.5 text-xs bg-brand-500 hover:bg-brand-400 text-white rounded-lg transition-colors disabled:opacity-50"
                        >
                            {triggering ? 'Triggering…' : 'Trigger Run'}
                        </button>
                    </div>
                )}

                {/* Runs list */}
                <div className="flex-1 overflow-y-auto">
                    {runs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                            <Activity className="w-8 h-8 text-gray-700 mb-3" />
                            <p className="text-xs text-gray-600">No runs yet</p>
                            <p className="text-xs text-gray-700 mt-1">Activate the agent and trigger it</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-white/5">
                            {runs.map(run => (
                                <button key={run.id} onClick={() => handleSelectRun(run)}
                                    className={cn('w-full text-left px-4 py-3 hover:bg-white/3 transition-colors',
                                        selectedRun?.id === run.id && 'bg-white/5 border-l-2 border-brand-500'
                                    )}>
                                    <div className="flex items-center justify-between gap-2 mb-1">
                                        <Badge status={run.status} />
                                        <span className="text-xs text-gray-600">{formatDuration(run.durationMs)}</span>
                                    </div>
                                    <p className="text-xs font-mono text-gray-500 truncate">{run.id}</p>
                                    <p className="text-xs text-gray-600 mt-0.5">{formatRelative(run.createdAt)}</p>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Right panel — run trace */}
            <div className="flex-1 overflow-y-auto">
                {!selectedRun ? (
                    <div className="flex items-center justify-center h-full">
                        <p className="text-sm text-gray-600">Select a run to view its trace</p>
                    </div>
                ) : (
                    <div className="p-6">
                        {/* Run summary */}
                        <div className="bg-white/3 border border-white/7 rounded-xl p-4 mb-6">
                            <div className="flex items-center justify-between gap-4 mb-3">
                                <div className="flex items-center gap-2">
                                    <Badge status={selectedRun.status} />
                                    <span className="text-xs font-mono text-gray-500">{selectedRun.id}</span>
                                </div>
                                <span className="text-xs text-gray-600">{formatDate(selectedRun.createdAt)}</span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div>
                                    <p className="text-xs text-gray-600">Duration</p>
                                    <p className="text-sm font-medium text-white">{formatDuration(selectedRun.durationMs)}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-600">Tokens</p>
                                    <p className="text-sm font-medium text-white">{formatTokens(selectedRun.llmTokensUsed)}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-600">Confidence</p>
                                    <p className="text-sm font-medium text-white">
                                        {selectedRun.confidenceScore != null ? `${Math.round(selectedRun.confidenceScore * 100)}%` : '—'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-600">Cost</p>
                                    <p className="text-sm font-medium text-white">
                                        {selectedRun.llmCostUsd != null ? `$${selectedRun.llmCostUsd.toFixed(4)}` : '—'}
                                    </p>
                                </div>
                            </div>
                            {selectedRun.errorMessage && (
                                <div className="mt-3 p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg">
                                    <p className="text-xs text-red-400 font-mono">{selectedRun.errorMessage}</p>
                                </div>
                            )}
                        </div>

                        {/* Output viewer */}
                        {(outputPayload || loadingOutput) && (
                            <div className="mb-6">
                                <button onClick={() => setShowOutput(v => !v)}
                                    className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 hover:text-gray-300 transition-colors">
                                    <FileText className="w-3.5 h-3.5" />
                                    Agent Output
                                    {showOutput ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                </button>
                                {showOutput && (
                                    loadingOutput ? (
                                        <div className="text-xs text-gray-600 px-1">Loading output…</div>
                                    ) : outputPayload ? (
                                        <OutputViewer output={outputPayload} />
                                    ) : null
                                )}
                            </div>
                        )}
                        {selectedRun.status === 'success' && !outputPayload && !loadingOutput && (
                            <button onClick={() => loadOutput(selectedRun.id)}
                                className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 mb-6 transition-colors">
                                <FileText className="w-3.5 h-3.5" /> View output
                            </button>
                        )}

                        {/* Timeline */}
                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
                            Execution Timeline
                        </h3>

                        {events.length === 0 ? (
                            <div className="text-center py-8">
                                <p className="text-xs text-gray-600">No audit events recorded for this run</p>
                            </div>
                        ) : (
                            <div className="relative">
                                <div className="absolute left-[18px] top-0 bottom-0 w-px bg-white/5" />
                                <div className="space-y-2">
                                    {events.map(event => (
                                        <div key={event.id} className="relative flex gap-3">
                                            <div className={cn(
                                                'relative z-10 w-9 h-9 shrink-0 rounded-full border flex items-center justify-center',
                                                EVENT_COLORS[event.eventType] ?? 'bg-gray-500/10 text-gray-400 border-gray-500/20'
                                            )}>
                                                {EVENT_ICONS[event.eventType] ?? <Database className="w-3.5 h-3.5" />}
                                            </div>

                                            <button
                                                onClick={() => setExpanded(expanded === event.id ? null : event.id)}
                                                className="flex-1 text-left bg-white/3 hover:bg-white/5 border border-white/7 hover:border-white/10 rounded-xl p-3 transition-colors"
                                            >
                                                <div className="flex items-center justify-between gap-3">
                                                    <div>
                                                        <p className="text-xs font-medium text-gray-200">
                                                            {event.eventType.replace(/_/g, ' ')}
                                                        </p>
                                                        <EventSummary event={event} />
                                                    </div>
                                                    <span className="text-xs text-gray-600 shrink-0">
                                                        {formatDate(event.occurredAt)}
                                                    </span>
                                                </div>

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
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

// ── Output viewer — renders gmail digest summary nicely or falls back to JSON ──
function OutputViewer({ output }: { output: Record<string, unknown> }) {
    const { digest_summary, email_summaries, total_emails, emails_fetched, days_covered } = output as {
        digest_summary?: string
        email_summaries?: Array<{ from: string; subject: string; summary: string; importance: string }>
        total_emails?: number
        emails_fetched?: number
        days_covered?: number
        _meta?: unknown
    }

    // Gmail digest formatted view
    if (digest_summary) {
        return (
            <div className="bg-white/3 border border-white/7 rounded-xl p-4 space-y-4">
                {/* Stats */}
                <div className="flex items-center gap-4 text-xs text-gray-500">
                    {emails_fetched != null && <span>{emails_fetched} emails read</span>}
                    {days_covered != null && <span>Last {days_covered} days</span>}
                    {total_emails != null && <span>{total_emails} in inbox</span>}
                </div>

                {/* Summary */}
                <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Summary</p>
                    <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">{digest_summary}</p>
                </div>

                {/* Individual email summaries */}
                {email_summaries && email_summaries.length > 0 && (
                    <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Email Highlights</p>
                        <div className="space-y-2">
                            {email_summaries.map((e, i) => (
                                <div key={i} className={cn(
                                    'p-3 rounded-lg border text-xs',
                                    e.importance === 'high' ? 'border-amber-500/20 bg-amber-500/5' : 'border-white/7 bg-white/2'
                                )}>
                                    <div className="flex items-start justify-between gap-2 mb-1">
                                        <p className="font-medium text-gray-200">{e.subject}</p>
                                        {e.importance === 'high' && <span className="text-amber-400 shrink-0">High</span>}
                                    </div>
                                    <p className="text-gray-500 mb-1">{e.from}</p>
                                    <p className="text-gray-400">{e.summary}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        )
    }

    // Generic JSON fallback
    const displayOutput = { ...output }
    delete (displayOutput as Record<string, unknown>)._meta
    return (
        <pre className="text-xs text-gray-400 font-mono bg-black/20 border border-white/7 rounded-xl p-4 overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(displayOutput, null, 2)}
        </pre>
    )
}

function EventSummary({ event }: { event: AuditEvent }) {
    if (event.llmMetadata) {
        return (
            <p className="text-xs text-gray-600">
                {event.llmMetadata.modelId} · {event.llmMetadata.promptTokens + event.llmMetadata.completionTokens} tokens · {event.llmMetadata.latencyMs}ms
                {event.llmMetadata.confidenceScore != null && ` · confidence: ${Math.round(event.llmMetadata.confidenceScore * 100)}%`}
            </p>
        )
    }
    if (event.connectorCall) {
        return (
            <p className="text-xs text-gray-600">
                {event.connectorCall.provider}.{event.connectorCall.actionPrimitive} · {event.connectorCall.responseStatus} · {event.connectorCall.latencyMs}ms
            </p>
        )
    }
    if (event.guardrailResults) {
        const blocked = event.guardrailResults.filter(r => !r.passed).length
        return (
            <p className="text-xs text-gray-600">
                {event.guardrailResults.length} checks · {blocked > 0 ? `${blocked} blocked` : 'all passed'}
            </p>
        )
    }
    return null
}

function EventDetails({ event }: { event: AuditEvent }) {
    if (event.guardrailResults) {
        return (
            <div className="space-y-1.5">
                {event.guardrailResults.map((r, i) => (
                    <div key={i} className={cn(
                        'flex items-start gap-2 text-xs p-2 rounded-lg',
                        r.passed ? 'bg-emerald-500/5 text-emerald-400' : 'bg-red-500/5 text-red-400'
                    )}>
                        {r.passed
                            ? <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0" />
                            : <XCircle className="w-3 h-3 mt-0.5 shrink-0" />
                        }
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
                <div className="bg-white/3 rounded-lg p-2">
                    <p className="text-gray-600">Model</p>
                    <p className="text-gray-200">{event.llmMetadata.modelId}</p>
                </div>
                <div className="bg-white/3 rounded-lg p-2">
                    <p className="text-gray-600">Tokens</p>
                    <p className="text-gray-200">{event.llmMetadata.promptTokens}+{event.llmMetadata.completionTokens}</p>
                </div>
                <div className="bg-white/3 rounded-lg p-2">
                    <p className="text-gray-600">Latency</p>
                    <p className="text-gray-200">{event.llmMetadata.latencyMs}ms</p>
                </div>
            </div>
        )
    }
    if (event.metadata) {
        return (
            <pre className="text-xs text-gray-500 font-mono overflow-x-auto">
                {JSON.stringify(event.metadata, null, 2)}
            </pre>
        )
    }
    return null
}

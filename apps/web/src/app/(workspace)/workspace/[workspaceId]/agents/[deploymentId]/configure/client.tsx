'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    Save, Zap, ArrowLeft, CheckCircle, Plug, Shield,
    Settings, ChevronDown, ChevronRight, Copy, AlertCircle,
    Info, Webhook, Bell, User
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Agent { id: string; slug: string; displayName: string; tagline: string; vertical: string }
interface AgentVersion {
    id: string; semver: string
    inputSchema: Record<string, unknown>
    requiredConnectors: Array<{ provider: string; scopes: string[]; optional?: boolean }>
    guardrailRules: Array<{ type: string; severity: string }>
    modelConfig: { provider: string; modelId: string }
}
interface Connector { id: string; displayName: string; provider: string; healthStatus: string }
interface Deployment {
    id: string; instanceName: string; deploymentEnv: string; status: string
    webhookUrl?: string | null
    connectorBindings: Array<{ connectorRef: string; connectorId: string; connectorName: string }>
    triggerType: string; executionMode: string; maxRunsPerHour: number
}
interface Props {
    workspaceId: string; agent: Agent; agentVersion: AgentVersion
    deployment: Deployment | null; connectors: Connector[]; isNew: boolean
}

function Section({ title, description, icon, children, defaultOpen = false }: {
    title: string; description: string; icon: React.ReactNode
    children: React.ReactNode; defaultOpen?: boolean
}) {
    const [open, setOpen] = useState(defaultOpen)
    return (
        <div className="border border-white/7 rounded-2xl overflow-hidden">
            <button type="button" onClick={() => setOpen(!open)}
                className="w-full flex items-center gap-3 p-4 hover:bg-white/3 transition-colors text-left">
                <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/15 flex items-center justify-center text-brand-400 shrink-0">
                    {icon}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">{title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{description}</p>
                </div>
                {open ? <ChevronDown className="w-4 h-4 text-gray-600 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-600 shrink-0" />}
            </button>
            {open && <div className="px-4 pb-4 border-t border-white/7 pt-4 space-y-4">{children}</div>}
        </div>
    )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-300 flex items-center gap-1.5">
                {label}
                {hint && (
                    <span title={hint} className="text-gray-600 cursor-help">
                        <Info className="w-3 h-3" />
                    </span>
                )}
            </label>
            {children}
        </div>
    )
}

const inputClass = "w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand-500/50 focus:bg-white/8 transition-all"
const selectClass = "w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-brand-500/50 transition-all appearance-none"

export function ConfigureClient({ workspaceId, agent, agentVersion, deployment, connectors, isNew }: Props) {
    const router = useRouter()
    const [saving, setSaving] = useState(false)
    const [activating, setActivating] = useState(false)
    const [saved, setSaved] = useState(false)
    const [error, setError] = useState('')
    const [deploymentId, setDeploymentId] = useState(deployment?.id ?? '')
    const [webhookUrl, setWebhookUrl] = useState(deployment?.webhookUrl ?? '')
    const [copied, setCopied] = useState(false)

    // Form state
    const [instanceName, setInstanceName] = useState(deployment?.instanceName ?? `${agent.displayName}`)
    const [deploymentEnv, setDeploymentEnv] = useState(deployment?.deploymentEnv ?? 'production')
    const [bindings, setBindings] = useState<Record<string, string>>(() => {
        const init: Record<string, string> = {}
        deployment?.connectorBindings?.forEach(b => { init[b.connectorRef] = b.connectorId })
        return init
    })
    const [params, setParams] = useState<Record<string, unknown>>({})
    const [confidenceThreshold, setConfidenceThreshold] = useState(0.65)
    const [topicBlocklist, setTopicBlocklist] = useState('')
    const [piiPolicy, setPiiPolicy] = useState('mask_in_logs')
    const [fallback, setFallback] = useState('escalate_to_human')
    const [maxRuns, setMaxRuns] = useState(deployment?.maxRunsPerHour ?? 1000)
    const [triggerType, setTriggerType] = useState(deployment?.triggerType ?? 'webhook')
    const [cronExpr, setCronExpr] = useState('0 9 * * 1-5')
    const [executionMode, setExecutionMode] = useState(deployment?.executionMode ?? 'async')
    const [slackAlert, setSlackAlert] = useState('')

    const inputSchemaProps = (agentVersion.inputSchema as { properties?: Record<string, unknown> })?.properties ?? {}
    async function handleSave() {
        setSaving(true); setError('')
        try {
            const body = {
                agentId: agent.id,
                agentVersionId: agentVersion.id,
                instanceName,
                deploymentEnv,
                connectorBindings: Object.entries(bindings).map(([ref, id]) => ({
                    connectorRef: ref, connectorId: id,
                    connectorName: connectors.find(c => c.id === id)?.displayName ?? ref,
                })),
                config: params,
                guardrailOverrides: {
                    confidenceThreshold,
                    topicBlocklist: topicBlocklist.split(',').map(s => s.trim()).filter(Boolean),
                    piiHandlingPolicy: piiPolicy,
                    fallbackBehaviour: fallback,
                    maxRunsPerHour: maxRuns,
                },
                triggerType,
                triggerConfig: triggerType === 'schedule' ? { cronExpression: cronExpr } : {},
                executionMode,
                alertChannels: slackAlert ? [{ type: 'slack', destination: slackAlert, events: ['run_failed'] }] : [],
                maxRunsPerHour: maxRuns,
            }

            const url = (isNew || !deploymentId)
                ? `/api/v1/workspaces/${workspaceId}/deployments`
                : `/api/v1/workspaces/${workspaceId}/deployments/${deploymentId}`

            const resp = await fetch(url, {
                method: isNew || !deploymentId ? 'POST' : 'PATCH',
                headers: { 'Content-Type': 'application/json', 'X-Workspace-Id': workspaceId },
                body: JSON.stringify(body),
            })
            if (!resp.ok) throw new Error(((await resp.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${resp.status}`)
            const data = await resp.json() as { data: { id: string; webhookUrl?: string } }
            if (data.data.id) setDeploymentId(data.data.id)
            if (data.data.webhookUrl) setWebhookUrl(data.data.webhookUrl)
            setSaved(true); setTimeout(() => setSaved(false), 2000)
        } catch (e) { setError(e instanceof Error ? e.message : 'Failed to save') }
        finally { setSaving(false) }
    }

    async function handleActivate() {
        if (!deploymentId) { await handleSave(); return }
        setActivating(true); setError('')
        try {
            const resp = await fetch(`/api/v1/workspaces/${workspaceId}/deployments/${deploymentId}/activate`, {
                method: 'POST',
            })
            if (!resp.ok) throw new Error(((await resp.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${resp.status}`)
            const data = await resp.json() as { data: { webhookUrl?: string } }
            if (data.data.webhookUrl) setWebhookUrl(data.data.webhookUrl)
            router.push(`/workspace/${workspaceId}/agents`)
        } catch (e) { setError(e instanceof Error ? e.message : 'Failed to activate') }
        finally { setActivating(false) }
    }

    return (
        <div className="p-6 max-w-2xl">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <button onClick={() => router.back()} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 text-gray-600 hover:text-gray-300 transition-colors">
                    <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="flex-1">
                    <h1 className="text-xl font-bold text-white">{isNew ? 'Configure Agent' : 'Edit Configuration'}</h1>
                    <p className="text-xs text-gray-500">{agent.displayName} · v{agentVersion.semver} · {agentVersion.modelConfig.modelId}</p>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl mb-4">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-400">{error}</p>
                </div>
            )}

            {/* Webhook URL */}
            {webhookUrl && (
                <div className="p-4 bg-emerald-500/8 border border-emerald-500/20 rounded-2xl mb-4">
                    <p className="text-xs font-semibold text-emerald-400 mb-2 flex items-center gap-1.5">
                        <CheckCircle className="w-3.5 h-3.5" /> Agent is active — webhook URL ready
                    </p>
                    <div className="flex items-center gap-2">
                        <code className="flex-1 text-xs font-mono text-gray-400 bg-black/20 rounded-lg px-3 py-2 truncate">{webhookUrl}</code>
                        <button onClick={async () => { await navigator.clipboard.writeText(webhookUrl); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                            className="shrink-0 p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-gray-500 hover:text-gray-300 transition-colors">
                            {copied ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                    </div>
                    <p className="text-xs text-gray-600 mt-2">POST any JSON payload to this URL to trigger the agent</p>
                </div>
            )}

            {/* Sections */}
            <div className="space-y-3">

                {/* 1 — Identity */}
                <Section title="Name this deployment" description="Give this agent a memorable name for your workspace" icon={<Settings className="w-4 h-4" />} defaultOpen>
                    <Field label="Deployment name" hint="Use a name that describes where/how this agent is being used">
                        <input className={inputClass} value={instanceName} onChange={e => setInstanceName(e.target.value)} placeholder="e.g. Tier-1 Reply — EMEA Team" />
                    </Field>
                    <Field label="Environment" hint="Sandbox mode mocks all connector calls — safe for testing">
                        <select className={selectClass} value={deploymentEnv} onChange={e => setDeploymentEnv(e.target.value)}>
                            <option value="production" className="bg-gray-900">Production — real connector calls</option>
                            <option value="sandbox" className="bg-gray-900">Sandbox — mocked connector calls (safe for testing)</option>
                        </select>
                    </Field>
                </Section>

                {/* 2 — Connectors */}
                <Section title="Connect your services" description="Link the external tools this agent needs to do its job" icon={<Plug className="w-4 h-4" />} defaultOpen={agentVersion.requiredConnectors.length > 0}>
                    {agentVersion.requiredConnectors.length === 0 ? (
                        <p className="text-xs text-gray-600 py-2">This agent works without any external integrations.</p>
                    ) : (
                        <div className="space-y-2">
                            {agentVersion.requiredConnectors.map(req => {
                                const matching = connectors.filter(c => c.provider === req.provider)
                                const bound = bindings[req.provider]
                                const boundConn = connectors.find(c => c.id === bound)
                                return (
                                    <div key={req.provider} className="flex items-center gap-3 p-3 bg-white/3 border border-white/7 rounded-xl">
                                        <div className={cn('w-2 h-2 rounded-full shrink-0', boundConn ? 'bg-emerald-400' : 'bg-gray-600')} />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-medium text-gray-200 capitalize">{req.provider}</p>
                                            <p className="text-xs text-gray-600">Needs: {req.scopes.join(', ')}</p>
                                        </div>
                                        {matching.length > 0 ? (
                                            <select value={bound ?? ''} onChange={e => setBindings(b => ({ ...b, [req.provider]: e.target.value }))}
                                                className="text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-gray-300 focus:outline-none focus:border-brand-500/50">
                                                <option value="" className="bg-gray-900">Select…</option>
                                                {matching.map(c => <option key={c.id} value={c.id} className="bg-gray-900">{c.displayName}</option>)}
                                            </select>
                                        ) : (
                                            <a href={`/workspace/${workspaceId}/connectors`}
                                                className="text-xs text-brand-400 hover:text-brand-300 bg-brand-500/10 border border-brand-500/20 rounded-lg px-2.5 py-1.5 transition-colors whitespace-nowrap">
                                                + Connect
                                            </a>
                                        )}
                                        {req.optional && <span className="text-xs text-gray-700 italic">optional</span>}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </Section>

                {/* 3 — Agent parameters */}
                {Object.keys(inputSchemaProps).length > 0 && (
                    <Section title="Agent parameters" description="Optional settings to customise how this agent behaves" icon={<User className="w-4 h-4" />}>
                        {Object.entries(inputSchemaProps).map(([key, rawProp]) => {
                            const prop = rawProp as { type?: string; description?: string; enum?: string[]; default?: unknown }
                            const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
                            if (prop.enum) return (
                                <Field key={key} label={label} hint={prop.description}>
                                    <select className={selectClass} value={(params[key] ?? '') as string} onChange={e => setParams(p => ({ ...p, [key]: e.target.value }))}>
                                        {prop.enum.map(v => <option key={v} value={v} className="bg-gray-900">{v}</option>)}
                                    </select>
                                </Field>
                            )
                            return (
                                <Field key={key} label={label} hint={prop.description}>
                                    <input className={inputClass} value={(params[key] ?? '') as string} placeholder={prop.description}
                                        onChange={e => setParams(p => ({ ...p, [key]: e.target.value }))} />
                                </Field>
                            )
                        })}
                    </Section>
                )}

                {/* 4 — Safety */}
                <Section title="Safety settings" description="Control when the agent acts automatically vs asks for human review" icon={<Shield className="w-4 h-4" />}>
                    <Field label={`Confidence threshold: ${confidenceThreshold}`} hint="Below this score, the agent will ask for human review instead of acting automatically">
                        <input type="range" min="0" max="1" step="0.05" value={confidenceThreshold}
                            onChange={e => setConfidenceThreshold(Number(e.target.value))} className="w-full accent-brand-500" />
                        <div className="flex justify-between text-xs text-gray-600 mt-1">
                            <span>0.0 — Always act</span><span>1.0 — Always review</span>
                        </div>
                    </Field>
                    <Field label="Blocked topics (comma-separated)" hint="The agent will refuse to respond to these topics">
                        <input className={inputClass} value={topicBlocklist} onChange={e => setTopicBlocklist(e.target.value)} placeholder="e.g. competitor pricing, legal advice, medical diagnosis" />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="When confidence is low" hint="What should happen when the agent isn't confident enough to act?">
                            <select className={selectClass} value={fallback} onChange={e => setFallback(e.target.value)}>
                                <option value="escalate_to_human" className="bg-gray-900">Ask a human to review</option>
                                <option value="return_error" className="bg-gray-900">Return an error</option>
                                <option value="skip_silently" className="bg-gray-900">Skip silently</option>
                            </select>
                        </Field>
                        <Field label="Personal data (PII)" hint="How should the agent handle names, emails, phone numbers etc?">
                            <select className={selectClass} value={piiPolicy} onChange={e => setPiiPolicy(e.target.value)}>
                                <option value="mask_in_logs" className="bg-gray-900">Hide in logs only</option>
                                <option value="pass_through" className="bg-gray-900">Allow through</option>
                                <option value="redact_before_llm" className="bg-gray-900">Remove before AI sees it</option>
                                <option value="reject_if_present" className="bg-gray-900">Block if PII found</option>
                            </select>
                        </Field>
                    </div>
                </Section>

                {/* 5 — Trigger */}
                <Section title="How to trigger this agent" description="Choose when and how this agent runs" icon={<Webhook className="w-4 h-4" />}>
                    <Field label="Trigger type" hint="Webhook: you send data. Schedule: runs automatically on a timer. Manual: only from this dashboard.">
                        <select className={selectClass} value={triggerType} onChange={e => setTriggerType(e.target.value)}>
                            <option value="webhook" className="bg-gray-900">Webhook — I&apos;ll send data via HTTP POST</option>
                            <option value="schedule" className="bg-gray-900">Schedule — run automatically on a timer</option>
                            <option value="manual" className="bg-gray-900">Manual — only from the dashboard</option>
                        </select>
                    </Field>
                    {triggerType === 'schedule' && (
                        <Field label="Schedule" hint="When to run. The scheduler checks every minute.">
                            <div className="grid grid-cols-2 gap-2 mb-2">
                                {[
                                    { label: 'Every hour', cron: '0 * * * *' },
                                    { label: 'Every 6 hours', cron: '0 */6 * * *' },
                                    { label: 'Daily at 8am', cron: '0 8 * * *' },
                                    { label: 'Weekdays 9am', cron: '0 9 * * 1-5' },
                                ].map(preset => (
                                    <button key={preset.cron} type="button"
                                        onClick={() => setCronExpr(preset.cron)}
                                        className={`px-3 py-2 text-xs rounded-lg border text-left transition-colors ${cronExpr === preset.cron ? 'border-brand-500 bg-brand-500/10 text-brand-300' : 'border-white/10 bg-white/3 text-gray-400 hover:border-white/20'}`}>
                                        {preset.label}
                                        <span className="block font-mono text-gray-600 mt-0.5">{preset.cron}</span>
                                    </button>
                                ))}
                            </div>
                            <input className={inputClass} value={cronExpr} onChange={e => setCronExpr(e.target.value)} placeholder="0 9 * * 1-5" />
                            <p className="text-xs text-gray-600 mt-1">Custom cron: <code className="text-gray-500">minute hour day month weekday</code></p>
                        </Field>
                    )}
                    <Field label="Response mode" hint="Async is recommended for most cases. Sync waits for the result but has a 30-second limit.">
                        <select className={selectClass} value={executionMode} onChange={e => setExecutionMode(e.target.value)}>
                            <option value="async" className="bg-gray-900">Async — returns immediately, result available via API</option>
                            <option value="sync" className="bg-gray-900">Sync — waits for result (max 30 seconds)</option>
                        </select>
                    </Field>
                </Section>

                {/* 6 — Alerts */}
                <Section title="Alerts" description="Get notified when something needs attention" icon={<Bell className="w-4 h-4" />}>
                    <Field label="Slack channel for alerts" hint="We'll send a message here when runs fail or need human review">
                        <input className={inputClass} value={slackAlert} onChange={e => setSlackAlert(e.target.value)} placeholder="#support-ops" />
                    </Field>
                </Section>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-2">
                    <button onClick={handleSave} disabled={saving || activating}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/8 border border-white/10 rounded-xl text-sm font-medium text-gray-200 transition-all disabled:opacity-50">
                        {saving ? <span className="w-4 h-4 border-2 border-gray-400/30 border-t-gray-400 rounded-full animate-spin" /> : saved ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Save className="w-4 h-4" />}
                        {saving ? 'Saving…' : saved ? 'Saved!' : 'Save draft'}
                    </button>
                    <button onClick={handleActivate} disabled={saving || activating}
                        className="flex items-center gap-2 px-4 py-2.5 bg-brand-500 hover:bg-brand-400 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50 shadow-lg shadow-brand-500/20">
                        {activating ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Zap className="w-4 h-4" />}
                        {activating ? 'Activating…' : deployment?.status === 'active' ? 'Update & Activate' : 'Save & Activate'}
                    </button>
                </div>

            </div>
        </div>
    )
}

'use client'
import { useState } from 'react'
import { Button, Input, Textarea, Select, Toggle, Section, Card } from '@/components/ui'
import { cn } from '@/lib/utils'
import { Save, Zap, AlertCircle, CheckCircle, Plug } from 'lucide-react'
import type { AgentVersion, Deployment } from '@runlet/types'

interface ConfigCardProps {
  agentVersion: AgentVersion
  deployment?: Partial<Deployment>
  workspaceConnectors: Array<{ id: string; displayName: string; provider: string; healthStatus: string }>
  onSave: (config: Record<string, unknown>) => Promise<void>
  onActivate?: () => Promise<void>
  mode?: 'create' | 'edit'
}

export function ConfigurationCard({
  agentVersion,
  deployment,
  workspaceConnectors,
  onSave,
  onActivate,
  mode = 'create',
}: ConfigCardProps) {
  const [saving, setSaving] = useState(false)
  const [activating, setActivating] = useState(false)
  const [saved, setSaved] = useState(false)

  // Section 1 — Identity
  const [instanceName, setInstanceName] = useState(deployment?.instanceName ?? '')
  const [deploymentEnv, setDeploymentEnv] = useState(deployment?.deploymentEnv ?? 'production')

  // Section 2 — Connector bindings
  const [bindings, setBindings] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    deployment?.connectorBindings?.forEach(b => { initial[b.connectorRef] = b.connectorId })
    return initial
  })

  // Section 3 — Agent parameters (from input_schema)
  const [params, setParams] = useState<Record<string, unknown>>(
    (deployment?.config as Record<string, unknown>) ?? {}
  )

  // Section 4 — Guardrails
  const [confidenceThreshold, setConfidenceThreshold] = useState(
    (deployment?.guardrailOverrides as Record<string, number> | undefined)?.confidenceThreshold ?? 0.65
  )
  const [topicBlocklist, setTopicBlocklist] = useState(
    ((deployment?.guardrailOverrides as Record<string, unknown> | undefined)?.topicBlocklist as string[] ?? []).join(', ')
  )
  const [piiPolicy, setPiiPolicy] = useState(
    (deployment?.guardrailOverrides as Record<string, string> | undefined)?.piiHandlingPolicy ?? 'mask_in_logs'
  )
  const [fallback, setFallback] = useState(
    (deployment?.guardrailOverrides as Record<string, string> | undefined)?.fallbackBehaviour ?? 'escalate_to_human'
  )
  const [maxRuns, setMaxRuns] = useState(deployment?.maxRunsPerHour ?? 1000)

  // Section 5 — Trigger
  const [triggerType, setTriggerType] = useState(deployment?.triggerType ?? 'webhook')
  const [cronExpr, setCronExpr] = useState(
    (deployment?.triggerConfig as Record<string, string> | undefined)?.cron_expression ?? '0 9 * * 1-5'
  )
  const [executionMode, setExecutionMode] = useState(deployment?.executionMode ?? 'async')

  // Section 6 — Alerts
  const [slackAlertChannel, setSlackAlertChannel] = useState('')

  async function handleSave() {
    setSaving(true)
    try {
      const config = {
        instanceName,
        deploymentEnv,
        connectorBindings: Object.entries(bindings).map(([ref, id]) => {
          const conn = workspaceConnectors.find(c => c.id === id)
          return { connectorRef: ref, connectorId: id, connectorName: conn?.displayName ?? ref }
        }),
        config: params,
        guardrailOverrides: {
          confidenceThreshold,
          topicBlocklist: topicBlocklist.split(',').map(s => s.trim()).filter(Boolean),
          piiHandlingPolicy: piiPolicy,
          fallbackBehaviour: fallback,
          maxRunsPerHour: maxRuns,
        },
        triggerType,
        triggerConfig: triggerType === 'schedule' ? { cron_expression: cronExpr } : {},
        executionMode,
        alertChannels: slackAlertChannel ? [{ type: 'slack', destination: slackAlertChannel, events: ['run_failed', 'guardrail_triggered'] }] : [],
        maxRunsPerHour: maxRuns,
      }
      await onSave(config)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  async function handleActivate() {
    setActivating(true)
    try { await onActivate?.() }
    finally { setActivating(false) }
  }

  const inputSchemaProps = (agentVersion.inputSchema as { properties?: Record<string, unknown> })?.properties ?? {}

  return (
    <div className="space-y-4">

      {/* Section 1 — Identity */}
      <Section title="Deployment Identity" description="Name and scope this deployment">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Instance Name" value={instanceName} onChange={e => setInstanceName(e.target.value)}
            placeholder="e.g. Tier-1 Reply — EMEA Support" />
          <Select label="Environment" value={deploymentEnv} onChange={e => setDeploymentEnv(e.target.value as 'sandbox' | 'production')}
            options={[{ value: 'production', label: 'Production' }, { value: 'sandbox', label: 'Sandbox (mocked connectors)' }]} />
        </div>
      </Section>

      {/* Section 2 — Connector Bindings */}
      <Section title="Connector Bindings" description="Link external services this agent requires">
        <div className="space-y-2">
          {agentVersion.requiredConnectors.map(req => {
            const matching = workspaceConnectors.filter(c => c.provider === req.provider)
            const bound = bindings[req.provider]
            const boundConn = workspaceConnectors.find(c => c.id === bound)

            return (
              <div key={req.provider} className="flex items-center gap-3 p-3 bg-white/3 border border-white/7 rounded-lg">
                <div className={cn('w-2 h-2 rounded-full shrink-0',
                  boundConn?.healthStatus === 'healthy' ? 'bg-emerald-400' : bound ? 'bg-amber-400' : 'bg-gray-600')} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-300 capitalize">{req.provider}</p>
                  <p className="text-xs text-gray-600">Scopes: {req.scopes.join(', ')}</p>
                </div>
                {matching.length > 0 ? (
                  <select
                    value={bound ?? ''}
                    onChange={e => setBindings(b => ({ ...b, [req.provider]: e.target.value }))}
                    className="text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-gray-300 focus:outline-none focus:border-brand-500/60"
                  >
                    <option value="" className="bg-gray-900">Select connector…</option>
                    {matching.map(c => (
                      <option key={c.id} value={c.id} className="bg-gray-900">{c.displayName}</option>
                    ))}
                  </select>
                ) : (
                  <button className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 bg-brand-500/10 border border-brand-500/20 rounded-lg px-2.5 py-1.5 transition-colors">
                    <Plug className="w-3 h-3" /> Connect {req.provider}
                  </button>
                )}
                {req.optional && <span className="text-xs text-gray-600">optional</span>}
              </div>
            )
          })}
        </div>
      </Section>

      {/* Section 3 — Agent Parameters */}
      {Object.keys(inputSchemaProps).length > 0 && (
        <Section title="Agent Parameters" description="Configure agent-specific settings">
          <div className="space-y-3">
            {Object.entries(inputSchemaProps).map(([key, schemaProp]) => {
              const prop = schemaProp as { type?: string; description?: string; enum?: string[]; default?: unknown }
              const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
              const value = (params[key] ?? prop.default ?? '') as string

              if (prop.enum) {
                return <Select key={key} label={label} value={value}
                  onChange={e => setParams(p => ({ ...p, [key]: e.target.value }))}
                  options={prop.enum.map(v => ({ value: v, label: v }))} />
              }
              if (prop.type === 'boolean') {
                return <Toggle key={key} label={label} description={prop.description}
                  checked={Boolean(params[key] ?? prop.default)}
                  onChange={v => setParams(p => ({ ...p, [key]: v }))} />
              }
              return <Input key={key} label={label} value={value}
                placeholder={prop.description}
                onChange={e => setParams(p => ({ ...p, [key]: e.target.value }))} />
            })}
          </div>
        </Section>
      )}

      {/* Section 4 — Guardrails */}
      <Section title="Guardrail Configuration" description="Control agent behaviour and safety">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-400 block mb-1.5">
              Confidence Threshold: <span className="text-brand-400">{confidenceThreshold}</span>
            </label>
            <input type="range" min="0" max="1" step="0.05" value={confidenceThreshold}
              onChange={e => setConfidenceThreshold(Number(e.target.value))}
              className="w-full accent-brand-500" />
            <div className="flex justify-between text-xs text-gray-600 mt-1">
              <span>0.0 — Always act</span><span>1.0 — Always review</span>
            </div>
          </div>
          <Input label="Topic Blocklist (comma-separated)" value={topicBlocklist}
            onChange={e => setTopicBlocklist(e.target.value)}
            placeholder="e.g. competitor pricing, legal advice" />
          <div className="grid grid-cols-2 gap-3">
            <Select label="PII Handling" value={piiPolicy} onChange={e => setPiiPolicy(e.target.value)} options={[
              { value: 'pass_through', label: 'Pass through' },
              { value: 'mask_in_logs', label: 'Mask in logs' },
              { value: 'redact_before_llm', label: 'Redact before LLM' },
              { value: 'reject_if_present', label: 'Reject if PII found' },
            ]} />
            <Select label="Low Confidence Fallback" value={fallback} onChange={e => setFallback(e.target.value)} options={[
              { value: 'escalate_to_human', label: 'Escalate to human' },
              { value: 'return_error', label: 'Return error' },
              { value: 'skip_silently', label: 'Skip silently' },
            ]} />
          </div>
          <Input label="Max Runs Per Hour" type="number" value={maxRuns}
            onChange={e => setMaxRuns(Number(e.target.value))} />
        </div>
      </Section>

      {/* Section 5 — Trigger */}
      <Section title="Trigger Configuration" description="How this agent is invoked">
        <div className="space-y-3">
          <Select label="Trigger Type" value={triggerType} onChange={e => setTriggerType(e.target.value)} options={[
            { value: 'webhook', label: 'Webhook (HTTP POST)' },
            { value: 'schedule', label: 'Schedule (Cron)' },
            { value: 'connector_event', label: 'Connector Event' },
            { value: 'manual', label: 'Manual / API Call' },
          ]} />
          {triggerType === 'schedule' && (
            <Input label="Cron Expression" value={cronExpr} onChange={e => setCronExpr(e.target.value)}
              hint="e.g. '0 9 * * 1-5' = 9am Mon–Fri" />
          )}
          <Select label="Execution Mode" value={executionMode} onChange={e => setExecutionMode(e.target.value as 'async' | 'sync')} options={[
            { value: 'async', label: 'Async (returns run_id immediately)' },
            { value: 'sync', label: 'Sync (waits for result, max 30s)' },
          ]} />
        </div>
      </Section>

      {/* Section 6 — Alerts */}
      <Section title="Notifications" description="Where to send alerts">
        <Input label="Slack Alert Channel" value={slackAlertChannel}
          onChange={e => setSlackAlertChannel(e.target.value)}
          placeholder="#support-alerts" />
      </Section>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <Button onClick={handleSave} loading={saving} size="md">
          {saved ? <><CheckCircle className="w-4 h-4 text-emerald-400" /> Saved</> : <><Save className="w-4 h-4" /> Save Configuration</>}
        </Button>
        {onActivate && (
          <Button variant="secondary" onClick={handleActivate} loading={activating} size="md">
            <Zap className="w-4 h-4 text-amber-400" /> Activate
          </Button>
        )}
      </div>
    </div>
  )
}

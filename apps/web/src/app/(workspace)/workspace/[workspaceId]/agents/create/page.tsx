'use client'
import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Bot, ChevronRight, ChevronLeft, Sparkles, Loader2, CheckCircle, Plus, Trash2 } from 'lucide-react'

const STEPS = ['Identity', 'Model', 'Prompt', 'Connectors', 'Publish']

const MODEL_OPTIONS = [
  { provider: 'groq', models: [
    { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', note: 'Best quality · Free' },
    { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B', note: 'Fastest · Free' },
    { id: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B', note: 'Good balance · Free' },
  ]},
  { provider: 'anthropic', models: [
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', note: 'Fast · Paid' },
    { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', note: 'Best Claude · Paid' },
  ]},
  { provider: 'openai', models: [
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini', note: 'Fast · Paid' },
    { id: 'gpt-4o', label: 'GPT-4o', note: 'Most capable · Paid' },
  ]},
  { provider: 'gemini', models: [
    { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', note: 'Fast · Free tier' },
    { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', note: 'Best Gemini · Paid' },
  ]},
]

const CONNECTOR_PRESETS = ['gmail', 'slack', 'github', 'notion', 'zendesk', 'custom']

const VERTICAL_OPTIONS = ['engineering', 'customer_support', 'sales', 'marketing', 'operations', 'finance', 'hr']

export default function CreateAgentPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  const [form, setForm] = useState({
    displayName: '',
    tagline: '',
    category: '',
    vertical: 'operations',
    modelProvider: 'groq',
    modelId: 'llama-3.3-70b-versatile',
    temperature: 0.3,
    maxTokens: 1000,
    systemPrompt: '',
    connectors: [] as Array<{ provider: string; scopes: string[]; optional: boolean }>,
  })

  function set<K extends keyof typeof form>(key: K, val: typeof form[K]) {
    setForm(f => ({ ...f, [key]: val }))
  }

  function addConnector(provider: string) {
    if (form.connectors.some(c => c.provider === provider)) return
    set('connectors', [...form.connectors, { provider, scopes: [], optional: true }])
  }
  function removeConnector(provider: string) {
    set('connectors', form.connectors.filter(c => c.provider !== provider))
  }

  const canNext = [
    form.displayName.trim().length > 0,
    form.modelProvider && form.modelId,
    form.systemPrompt.trim().length > 20,
    true,
    true,
  ][step]

  async function publish() {
    setSaving(true)
    const res = await fetch(`/api/v1/workspaces/${workspaceId}/agent-studio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: form.displayName,
        tagline: form.tagline,
        category: form.category || 'Custom',
        vertical: form.vertical,
        systemPrompt: form.systemPrompt,
        modelProvider: form.modelProvider,
        modelId: form.modelId,
        temperature: form.temperature,
        maxTokens: form.maxTokens,
        requiredConnectors: form.connectors,
      }),
    })
    setSaving(false)
    if (res.ok) {
      setDone(true)
      setTimeout(() => router.push(`/workspace/${workspaceId}/agents`), 1500)
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
          <CheckCircle className="w-7 h-7 text-emerald-400" />
        </div>
        <p className="text-white font-semibold">Agent created!</p>
        <p className="text-sm text-gray-500">Redirecting to your agents…</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
          <Bot className="w-4 h-4 text-brand-400" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-white">Create Agent</h1>
          <p className="text-xs text-gray-500">Build a custom AI agent for your workspace</p>
        </div>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${i === step ? 'bg-brand-500 text-white' : i < step ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-white/5 text-gray-600 border border-white/10'}`}>
              {i < step ? '✓' : i + 1}
            </div>
            <span className={`text-xs ${i === step ? 'text-gray-200' : 'text-gray-600'}`}>{s}</span>
            {i < STEPS.length - 1 && <div className="w-6 h-px bg-white/10" />}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="bg-white/3 border border-white/7 rounded-xl p-6 mb-6">

        {/* Step 0: Identity */}
        {step === 0 && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-200 mb-4">What does this agent do?</h2>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Agent name <span className="text-red-400">*</span></label>
              <input value={form.displayName} onChange={e => set('displayName', e.target.value)}
                placeholder="e.g. Gmail Digest, Slack Summariser, Lead Qualifier"
                className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand-500/50" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Tagline</label>
              <input value={form.tagline} onChange={e => set('tagline', e.target.value)}
                placeholder="One sentence on what this agent does"
                className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand-500/50" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Category</label>
                <input value={form.category} onChange={e => set('category', e.target.value)}
                  placeholder="e.g. Communication, Hiring"
                  className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand-500/50" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Vertical</label>
                <select value={form.vertical} onChange={e => set('vertical', e.target.value)}
                  className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-brand-500/50">
                  {VERTICAL_OPTIONS.map(v => <option key={v} value={v} className="bg-gray-900">{v.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Step 1: Model */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-200 mb-1">Which model should power this agent?</h2>
            <p className="text-xs text-gray-500 mb-4">Models marked "Paid" require the corresponding API key in Settings → API Keys.</p>
            {MODEL_OPTIONS.map(group => (
              <div key={group.provider}>
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2 capitalize">{group.provider}</p>
                <div className="space-y-2">
                  {group.models.map(m => (
                    <label key={m.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${form.modelProvider === group.provider && form.modelId === m.id ? 'border-brand-500 bg-brand-500/5' : 'border-white/7 hover:border-white/15'}`}>
                      <input type="radio" name="model" checked={form.modelProvider === group.provider && form.modelId === m.id}
                        onChange={() => { set('modelProvider', group.provider); set('modelId', m.id) }}
                        className="accent-brand-500" />
                      <div>
                        <p className="text-sm text-gray-200">{m.label}</p>
                        <p className="text-xs text-gray-500">{m.note}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Temperature <span className="text-gray-600">({form.temperature})</span></label>
                <input type="range" min="0" max="1" step="0.1" value={form.temperature}
                  onChange={e => set('temperature', parseFloat(e.target.value))}
                  className="w-full accent-brand-500" />
                <div className="flex justify-between text-xs text-gray-600"><span>Precise</span><span>Creative</span></div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Max tokens</label>
                <select value={form.maxTokens} onChange={e => set('maxTokens', parseInt(e.target.value))}
                  className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-brand-500/50">
                  {[500, 1000, 1500, 2000, 4000].map(t => <option key={t} value={t} className="bg-gray-900">{t.toLocaleString()} tokens</option>)}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Prompt */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-200 mb-1">Write your system prompt</h2>
            <p className="text-xs text-gray-500 mb-2">This is the core instruction that defines your agent's behavior. Be specific about what it should do, what format to output, and any rules to follow.</p>
            <textarea
              value={form.systemPrompt}
              onChange={e => set('systemPrompt', e.target.value)}
              rows={14}
              placeholder={`You are an AI assistant that...\n\nYour job is to:\n1. ...\n2. ...\n\nRules:\n- Always...\n- Never...\n\nOutput format:\nRespond with a JSON object containing...`}
              className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand-500/50 font-mono resize-none"
            />
            <div className="flex items-center gap-2 p-3 bg-brand-500/5 border border-brand-500/20 rounded-lg">
              <Sparkles className="w-4 h-4 text-brand-400 shrink-0" />
              <p className="text-xs text-gray-400">Tip: Tell the agent to respond with a JSON object that includes a <code className="text-brand-300">confidence_score</code> field (0.0–1.0). This enables the confidence gate guardrail.</p>
            </div>
          </div>
        )}

        {/* Step 3: Connectors */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-200 mb-1">Which connectors does this agent need?</h2>
            <p className="text-xs text-gray-500 mb-4">Add connectors your agent will read from or write to. You can also skip this and add them later.</p>
            <div className="grid grid-cols-3 gap-2">
              {CONNECTOR_PRESETS.map(p => {
                const added = form.connectors.some(c => c.provider === p)
                return (
                  <button key={p} onClick={() => added ? removeConnector(p) : addConnector(p)}
                    className={`px-3 py-2.5 text-xs rounded-lg border text-center transition-colors capitalize ${added ? 'border-brand-500 bg-brand-500/10 text-brand-300' : 'border-white/10 bg-white/3 text-gray-400 hover:border-white/20'}`}>
                    {added ? '✓ ' : ''}{p}
                  </button>
                )
              })}
            </div>
            {form.connectors.length > 0 && (
              <div className="pt-2 space-y-2">
                <p className="text-xs text-gray-500">Selected connectors:</p>
                {form.connectors.map(c => (
                  <div key={c.provider} className="flex items-center justify-between bg-white/3 border border-white/7 rounded-lg px-3 py-2">
                    <span className="text-sm text-gray-300 capitalize">{c.provider}</span>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                        <input type="checkbox" checked={c.optional}
                          onChange={e => set('connectors', form.connectors.map(x => x.provider === c.provider ? { ...x, optional: e.target.checked } : x))}
                          className="accent-brand-500" />
                        Optional
                      </label>
                      <button onClick={() => removeConnector(c.provider)} className="text-gray-600 hover:text-red-400">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 4: Publish */}
        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-200 mb-4">Review and publish</h2>
            <div className="space-y-3 text-sm">
              {[
                { label: 'Name', value: form.displayName },
                { label: 'Tagline', value: form.tagline || '—' },
                { label: 'Category', value: `${form.category || 'Custom'} · ${form.vertical}` },
                { label: 'Model', value: `${form.modelProvider} / ${form.modelId}` },
                { label: 'Temperature', value: form.temperature },
                { label: 'Max tokens', value: form.maxTokens },
                { label: 'Connectors', value: form.connectors.length > 0 ? form.connectors.map(c => c.provider).join(', ') : 'None' },
              ].map(row => (
                <div key={row.label} className="flex items-start gap-3 py-2 border-b border-white/5">
                  <span className="text-xs text-gray-500 w-24 shrink-0">{row.label}</span>
                  <span className="text-gray-300 text-xs">{String(row.value)}</span>
                </div>
              ))}
            </div>
            <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
              <p className="text-xs text-gray-400">This agent will be created as a <strong className="text-gray-200">private</strong> agent visible only to your workspace. You can install and deploy it immediately from the Agents page.</p>
            </div>
          </div>
        )}
      </div>

      {/* Nav buttons */}
      <div className="flex items-center justify-between">
        <button onClick={() => step > 0 ? setStep(s => s - 1) : router.back()}
          className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors">
          <ChevronLeft className="w-4 h-4" /> {step === 0 ? 'Cancel' : 'Back'}
        </button>
        {step < STEPS.length - 1 ? (
          <button onClick={() => setStep(s => s + 1)} disabled={!canNext}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-brand-500 hover:bg-brand-400 text-white rounded-lg disabled:opacity-40 transition-colors">
            Next <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button onClick={publish} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-brand-500 hover:bg-brand-400 text-white rounded-lg disabled:opacity-50 transition-colors">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</> : <><Sparkles className="w-4 h-4" /> Create Agent</>}
          </button>
        )}
      </div>
    </div>
  )
}

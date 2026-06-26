'use client'
import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { Plug, Plus, Trash2, CheckCircle, AlertCircle, Loader2, Globe, ExternalLink } from 'lucide-react'

const PRESET_CONNECTORS = [
  { provider: 'slack', label: 'Slack', description: 'Post messages, read channels', authMethod: 'api_key', placeholder: 'xoxb-...' },
  { provider: 'github', label: 'GitHub', description: 'Read repos, PRs, issues', authMethod: 'api_key', placeholder: 'ghp_...' },
  { provider: 'notion', label: 'Notion', description: 'Read/write pages and databases', authMethod: 'api_key', placeholder: 'secret_...' },
  { provider: 'zendesk', label: 'Zendesk', description: 'Read/update support tickets', authMethod: 'api_key', placeholder: 'API token' },
  { provider: 'gmail', label: 'Gmail', description: 'Read emails via Google OAuth', authMethod: 'oauth2_pkce', placeholder: '' },
  { provider: 'custom', label: 'Custom REST API', description: 'Any HTTP API with an API key', authMethod: 'api_key', placeholder: 'API key or Bearer token' },
]

interface Connector {
  id: string
  displayName: string
  provider: string
  authMethod: string
  healthStatus: string
  createdAt: string
  metadata?: Record<string, unknown>
}

export default function ConnectorsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const searchParams = useSearchParams()
  const [connectors, setConnectors] = useState<Connector[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [connectingGoogle, setConnectingGoogle] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const [form, setForm] = useState({
    preset: '',
    displayName: '',
    provider: 'custom',
    apiKey: '',
    baseUrl: '',
  })

  useEffect(() => {
    load()
    // Show success/error toast from OAuth callback query params
    const connected = searchParams.get('connected')
    const error = searchParams.get('error')
    if (connected === 'gmail') showToast('Gmail connected successfully!', 'success')
    if (error) showToast(`OAuth error: ${error.replace(/_/g, ' ')}`, 'error')
  }, [workspaceId])

  async function load() {
    setLoading(true)
    const res = await fetch(`/api/v1/workspaces/${workspaceId}/connectors`)
    const json = await res.json()
    setConnectors(json.data ?? [])
    setLoading(false)
  }

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  function selectPreset(provider: string) {
    const p = PRESET_CONNECTORS.find(c => c.provider === provider)
    if (!p) return
    setForm(f => ({ ...f, preset: provider, provider, displayName: f.displayName || p.label }))
  }

  async function connectGoogle() {
    setConnectingGoogle(true)
    const res = await fetch(`/api/v1/workspaces/${workspaceId}/oauth/google/start`, { method: 'POST' })
    if (res.ok) {
      const json = await res.json() as { data: { url: string } }
      window.location.href = json.data.url
    } else {
      setConnectingGoogle(false)
      showToast('Failed to start Google OAuth. Check GOOGLE_CLIENT_ID is set.', 'error')
    }
  }

  async function create() {
    if (!form.displayName || !form.apiKey) return
    setSaving(true)
    const res = await fetch(`/api/v1/workspaces/${workspaceId}/connectors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: form.displayName,
        provider: form.provider,
        authMethod: 'api_key',
        apiKey: form.apiKey,
        metadata: form.baseUrl ? { baseUrl: form.baseUrl } : {},
      }),
    })
    setSaving(false)
    if (res.ok) {
      setShowForm(false)
      setForm({ preset: '', displayName: '', provider: 'custom', apiKey: '', baseUrl: '' })
      showToast('Connector added', 'success')
      load()
    } else {
      showToast('Failed to add connector', 'error')
    }
  }

  async function remove(id: string) {
    setDeleting(id)
    await fetch(`/api/v1/workspaces/${workspaceId}/connectors/${id}`, { method: 'DELETE' })
    setDeleting(null)
    showToast('Connector removed', 'success')
    load()
  }

  const HEALTH_COLORS: Record<string, string> = {
    healthy: 'text-emerald-400',
    degraded: 'text-amber-400',
    expired: 'text-red-400',
    unknown: 'text-gray-500',
  }

  const gmailConnected = connectors.some(c => c.provider === 'gmail' && c.healthStatus === 'healthy')
  const gmailConnector = connectors.find(c => c.provider === 'gmail')

  return (
    <div className="p-6 max-w-2xl">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium shadow-lg ${toast.type === 'success' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/20 text-red-300 border border-red-500/30'}`}>
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <Plug className="w-5 h-5 text-gray-500" />
          <h2 className="text-lg font-bold text-white">Connectors</h2>
        </div>
        <button onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-brand-500 hover:bg-brand-400 text-white rounded-lg transition-colors">
          <Plus className="w-3.5 h-3.5" /> Add Connector
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-6">Connect external services so your agents can read and write data. Credentials are encrypted at rest.</p>

      {/* Gmail featured card */}
      <div className="bg-white/3 border border-white/7 rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${gmailConnected ? 'bg-emerald-400' : 'bg-gray-600'}`} />
            <div>
              <p className="text-sm font-medium text-gray-200">Gmail</p>
              <p className="text-xs text-gray-500">
                {gmailConnected
                  ? `Connected as ${(gmailConnector?.metadata?.emailAddress as string) ?? 'unknown'}`
                  : 'Connect your Gmail to let agents read and summarise emails'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {gmailConnected && gmailConnector && (
              <button onClick={() => remove(gmailConnector.id)} disabled={deleting === gmailConnector.id}
                className="p-1.5 text-gray-600 hover:text-red-400 transition-colors">
                {deleting === gmailConnector.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            )}
            <button onClick={connectGoogle} disabled={connectingGoogle}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${gmailConnected ? 'border-white/10 bg-white/5 text-gray-400 hover:text-gray-200' : 'border-brand-500/30 bg-brand-500/10 text-brand-300 hover:bg-brand-500/15'}`}>
              {connectingGoogle ? <Loader2 className="w-3 h-3 animate-spin" /> : <ExternalLink className="w-3 h-3" />}
              {gmailConnected ? 'Reconnect' : 'Connect with Google'}
            </button>
          </div>
        </div>
        {!gmailConnected && (
          <div className="mt-3 pt-3 border-t border-white/7">
            <p className="text-xs text-gray-600">Requires <code className="text-gray-500">GOOGLE_CLIENT_ID</code> and <code className="text-gray-500">GOOGLE_CLIENT_SECRET</code> in your environment. Gmail API must be enabled in Google Cloud Console with redirect URI: <code className="text-gray-500">http://localhost:3001/v1/oauth/google/callback</code></p>
          </div>
        )}
      </div>

      {/* Add connector form */}
      {showForm && (
        <div className="bg-white/3 border border-brand-500/30 rounded-xl p-5 mb-6 space-y-4">
          <h3 className="text-sm font-semibold text-gray-200">New Connector</h3>
          <div>
            <p className="text-xs text-gray-500 mb-2">Select service</p>
            <div className="grid grid-cols-3 gap-2">
              {PRESET_CONNECTORS.filter(p => p.authMethod === 'api_key').map(p => (
                <button key={p.provider} onClick={() => selectPreset(p.provider)}
                  className={`px-3 py-2 text-xs rounded-lg border text-left transition-colors ${form.preset === p.provider ? 'border-brand-500 bg-brand-500/10 text-brand-300' : 'border-white/10 bg-white/3 text-gray-400 hover:border-white/20'}`}>
                  <p className="font-medium">{p.label}</p>
                  <p className="text-gray-600 mt-0.5 truncate">{p.description}</p>
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Display name</p>
            <input type="text" value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
              placeholder="e.g. My Slack Workspace"
              className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand-500/50" />
          </div>
          {form.preset === 'custom' && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Base URL <span className="text-gray-700">(optional)</span></p>
              <input type="url" value={form.baseUrl} onChange={e => setForm(f => ({ ...f, baseUrl: e.target.value }))}
                placeholder="https://api.example.com"
                className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand-500/50" />
            </div>
          )}
          <div>
            <p className="text-xs text-gray-500 mb-1">API Key / Token</p>
            <input type="password" value={form.apiKey} onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
              placeholder={PRESET_CONNECTORS.find(p => p.provider === form.preset)?.placeholder ?? 'Paste your API key…'}
              className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand-500/50 font-mono" />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button onClick={create} disabled={saving || !form.displayName || !form.apiKey}
              className="px-4 py-2 text-xs font-medium bg-brand-500 hover:bg-brand-400 text-white rounded-lg disabled:opacity-50 transition-colors">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Add Connector'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-3 py-2 text-xs text-gray-500 hover:text-gray-300">Cancel</button>
          </div>
        </div>
      )}

      {/* Connector list (non-Gmail) */}
      {loading ? (
        <div className="flex items-center gap-2 text-gray-500 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>
      ) : (
        <div className="space-y-2">
          {connectors.filter(c => c.provider !== 'gmail').map(c => (
            <div key={c.id} className="flex items-center justify-between bg-white/3 border border-white/7 rounded-xl px-4 py-3">
              <div className="flex items-center gap-3">
                <Globe className="w-4 h-4 text-gray-500" />
                <div>
                  <p className="text-sm font-medium text-gray-200">{c.displayName}</p>
                  <p className={`text-xs capitalize ${HEALTH_COLORS[c.healthStatus] ?? 'text-gray-500'}`}>
                    {c.provider} · {c.healthStatus}
                  </p>
                </div>
              </div>
              <button onClick={() => remove(c.id)} disabled={deleting === c.id} className="p-1.5 text-gray-600 hover:text-red-400 transition-colors">
                {deleting === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          ))}
          {connectors.filter(c => c.provider !== 'gmail').length === 0 && (
            <div className="text-center py-8 text-gray-600">
              <Plug className="w-6 h-6 mx-auto mb-2 opacity-30" />
              <p className="text-xs">No API key connectors yet. Add one above to connect external services.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Key, Plus, Trash2, Eye, EyeOff, CheckCircle, AlertCircle, Loader2, ChevronDown } from 'lucide-react'

const LLM_PROVIDERS = [
  { group: 'LLM Providers', keys: [
    { keyName: 'GROQ_API_KEY', label: 'Groq', hint: 'Get free key at console.groq.com', models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'] },
    { keyName: 'ANTHROPIC_API_KEY', label: 'Anthropic (Claude)', hint: 'Get key at console.anthropic.com', models: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-5'] },
    { keyName: 'OPENAI_API_KEY', label: 'OpenAI', hint: 'Get key at platform.openai.com', models: ['gpt-4o-mini', 'gpt-4o'] },
    { keyName: 'GEMINI_API_KEY', label: 'Google Gemini', hint: 'Get key at aistudio.google.com', models: ['gemini-1.5-flash', 'gemini-1.5-pro'] },
  ]},
  { group: 'Integrations', keys: [
    { keyName: 'RESEND_API_KEY', label: 'Resend (Email)', hint: 'Get key at resend.com', models: [] },
  ]},
]

interface Secret { id: string; keyName: string; hint: string | null; updatedAt: string }

export default function ApiKeysPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const [secrets, setSecrets] = useState<Secret[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState<string | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [showValue, setShowValue] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => { load() }, [workspaceId])

  async function load() {
    setLoading(true)
    const res = await fetch(`/api/v1/workspaces/${workspaceId}/secrets`)
    const json = await res.json()
    setSecrets(json.data ?? [])
    setLoading(false)
  }

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function save(keyName: string) {
    if (!inputValue.trim()) return
    setSaving(true)
    const res = await fetch(`/api/v1/workspaces/${workspaceId}/secrets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyName, value: inputValue.trim() }),
    })
    setSaving(false)
    if (res.ok) {
      setAdding(null)
      setInputValue('')
      showToast(`${keyName} saved`, 'success')
      load()
    } else {
      showToast('Failed to save key', 'error')
    }
  }

  async function remove(keyName: string) {
    setDeleting(keyName)
    await fetch(`/api/v1/workspaces/${workspaceId}/secrets/${keyName}`, { method: 'DELETE' })
    setDeleting(null)
    showToast(`${keyName} removed`, 'success')
    load()
  }

  function hasKey(keyName: string) { return secrets.some(s => s.keyName === keyName) }
  function getHint(keyName: string) { return secrets.find(s => s.keyName === keyName)?.hint }

  return (
    <div className="p-6 max-w-2xl">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium shadow-lg ${toast.type === 'success' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/20 text-red-300 border border-red-500/30'}`}>
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      <div className="flex items-center gap-3 mb-2">
        <Key className="w-5 h-5 text-gray-500" />
        <h2 className="text-lg font-bold text-white">API Keys</h2>
      </div>
      <p className="text-sm text-gray-500 mb-6">Keys are encrypted at rest and used automatically by agents in this workspace. Env vars are used as fallback if no workspace key is set.</p>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-500 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>
      ) : (
        <div className="space-y-6">
          {LLM_PROVIDERS.map(group => (
            <div key={group.group}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{group.group}</p>
              <div className="space-y-2">
                {group.keys.map(({ keyName, label, hint }) => {
                  const active = hasKey(keyName)
                  const isAdding = adding === keyName
                  return (
                    <div key={keyName} className="bg-white/3 border border-white/7 rounded-xl p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full ${active ? 'bg-emerald-400' : 'bg-gray-600'}`} />
                          <div>
                            <p className="text-sm font-medium text-gray-200">{label}</p>
                            <p className="text-xs text-gray-600">{active ? `Key set · ${getHint(keyName)}` : hint}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {active && (
                            <button
                              onClick={() => remove(keyName)}
                              disabled={deleting === keyName}
                              className="p-1.5 text-gray-600 hover:text-red-400 transition-colors"
                            >
                              {deleting === keyName ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          )}
                          <button
                            onClick={() => { setAdding(isAdding ? null : keyName); setInputValue(''); setShowValue(false) }}
                            className="px-3 py-1.5 text-xs font-medium bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-gray-300 transition-colors"
                          >
                            {active ? 'Update' : <><Plus className="w-3 h-3 inline -mt-0.5 mr-1" />Add</>}
                          </button>
                        </div>
                      </div>
                      {isAdding && (
                        <div className="mt-3 flex items-center gap-2">
                          <div className="relative flex-1">
                            <input
                              type={showValue ? 'text' : 'password'}
                              value={inputValue}
                              onChange={e => setInputValue(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && save(keyName)}
                              placeholder={`Paste ${label} key…`}
                              className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 pr-10 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand-500/50 font-mono"
                              autoFocus
                            />
                            <button type="button" onClick={() => setShowValue(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400">
                              {showValue ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                          <button onClick={() => save(keyName)} disabled={saving || !inputValue}
                            className="px-3 py-2 text-xs font-medium bg-brand-500 hover:bg-brand-400 text-white rounded-lg disabled:opacity-50 transition-colors">
                            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
                          </button>
                          <button onClick={() => { setAdding(null); setInputValue('') }} className="px-3 py-2 text-xs text-gray-500 hover:text-gray-300">Cancel</button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

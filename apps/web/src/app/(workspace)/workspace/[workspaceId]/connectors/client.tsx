'use client'
import { useState } from 'react'
import { Button, Empty } from '@/components/ui'
import { formatRelative } from '@/lib/utils'
import { Plug, Plus, Trash2, CheckCircle, AlertTriangle, XCircle, RefreshCw } from 'lucide-react'

const PROVIDER_ICONS: Record<string, string> = {
    zendesk: '🎫', slack: '💬', github: '🐙', notion: '📄',
    salesforce: '☁️', hubspot: '🟠', jira: '🔵', linear: '🟣', custom: '⚙️',
}

interface Connector {
    id: string
    displayName: string
    provider: string
    healthStatus: string
    grantedScopes: string[]
    usageCount: number
    lastUsedAt: Date | null
    createdAt: Date
}

interface Props {
    initialConnectors: Connector[]
    workspaceId: string
}

export function ConnectorsClient({ initialConnectors, workspaceId }: Props) {
    const [connectors, setConnectors] = useState(initialConnectors)
    const [showAdd, setShowAdd] = useState(false)
    const [newProvider, setNewProvider] = useState('zendesk')
    const [newName, setNewName] = useState('')
    const [newApiKey, setNewApiKey] = useState('')
    const [newSubdomain, setNewSubdomain] = useState('')
    const [adding, setAdding] = useState(false)
    const [error, setError] = useState('')

    async function handleAdd() {
        setAdding(true)
        setError('')
        try {
            const resp = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/v1/workspaces/${workspaceId}/connectors`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Workspace-Id': workspaceId,
                    // Use session token from cookie
                    'Authorization': `Bearer ${document.cookie.split(';').find(c => c.trim().startsWith('next-auth.session-token='))?.split('=')?.[1] ?? ''}`,
                },
                body: JSON.stringify({
                    displayName: newName || `${newProvider} connector`,
                    provider: newProvider,
                    authMethod: 'api_key',
                    apiKey: newApiKey,
                    metadata: newSubdomain ? { subdomain: newSubdomain } : {},
                }),
            })

            if (!resp.ok) {
                const err = await resp.json().catch(() => ({})) as { error?: string }
                throw new Error(err.error ?? `HTTP ${resp.status}`)
            }

            // Reload page to get fresh data
            window.location.reload()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to add connector')
        } finally {
            setAdding(false)
        }
    }

    const healthIcon = (s: string) => {
        if (s === 'healthy') return <CheckCircle className="w-4 h-4 text-emerald-400" />
        if (s === 'degraded') return <AlertTriangle className="w-4 h-4 text-amber-400" />
        return <XCircle className="w-4 h-4 text-gray-600" />
    }

    return (
        <div className="p-6">
            <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-xl font-bold text-white">Connectors</h1>
                    <p className="text-sm text-gray-500">External service integrations for your workspace</p>
                </div>
                <Button size="sm" onClick={() => setShowAdd(!showAdd)}>
                    <Plus className="w-3.5 h-3.5" /> Add Connector
                </Button>
            </div>

            {/* Add form */}
            {showAdd && (
                <div className="bg-white/3 border border-white/7 rounded-xl p-4 mb-4">
                    <h3 className="text-sm font-semibold text-gray-200 mb-3">Add Connector</h3>
                    {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
                    <div className="grid grid-cols-2 gap-3 mb-3">
                        <div>
                            <label className="text-xs text-gray-500 mb-1 block">Provider</label>
                            <select value={newProvider} onChange={e => setNewProvider(e.target.value)}
                                className="w-full text-sm bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-gray-200 focus:outline-none focus:border-brand-500/50">
                                {['zendesk', 'slack', 'github', 'notion', 'salesforce', 'hubspot'].map(p => (
                                    <option key={p} value={p} className="bg-gray-900">{PROVIDER_ICONS[p]} {p}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 mb-1 block">Display Name</label>
                            <input className="w-full text-sm bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-gray-200 focus:outline-none focus:border-brand-500/50"
                                value={newName} onChange={e => setNewName(e.target.value)}
                                placeholder={`${newProvider} — Production`} />
                        </div>
                        {newProvider === 'zendesk' && (
                            <div>
                                <label className="text-xs text-gray-500 mb-1 block">Subdomain</label>
                                <input className="w-full text-sm bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-gray-200 focus:outline-none focus:border-brand-500/50"
                                    value={newSubdomain} onChange={e => setNewSubdomain(e.target.value)}
                                    placeholder="yourcompany" />
                            </div>
                        )}
                        <div className={newProvider === 'zendesk' ? '' : 'col-span-2'}>
                            <label className="text-xs text-gray-500 mb-1 block">API Key / Token</label>
                            <input type="password"
                                className="w-full text-sm bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-gray-200 focus:outline-none focus:border-brand-500/50"
                                value={newApiKey} onChange={e => setNewApiKey(e.target.value)}
                                placeholder="Paste your API key" />
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Button size="sm" onClick={handleAdd} loading={adding}>Save Connector</Button>
                        <Button size="sm" variant="ghost" onClick={() => { setShowAdd(false); setError('') }}>Cancel</Button>
                    </div>
                </div>
            )}

            {connectors.length === 0 && !showAdd ? (
                <Empty
                    icon={<Plug className="w-10 h-10" />}
                    title="No connectors yet"
                    description="Connect your first external service to enable agent actions."
                    action={<Button size="sm" onClick={() => setShowAdd(true)}><Plus className="w-3.5 h-3.5" /> Add Connector</Button>}
                />
            ) : (
                <div className="space-y-2">
                    {connectors.map(conn => (
                        <div key={conn.id} className="flex items-center gap-4 bg-white/3 border border-white/7 rounded-xl px-4 py-3">
                            <div className="text-2xl w-9 text-center shrink-0">{PROVIDER_ICONS[conn.provider] ?? '⚙️'}</div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium text-white">{conn.displayName}</p>
                                    <span className="text-xs text-gray-600 capitalize px-1.5 py-0.5 bg-white/5 rounded">{conn.provider}</span>
                                </div>
                                <p className="text-xs text-gray-600">
                                    {conn.grantedScopes.join(', ') || 'No scopes'} · {conn.usageCount} calls
                                </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                {healthIcon(conn.healthStatus)}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

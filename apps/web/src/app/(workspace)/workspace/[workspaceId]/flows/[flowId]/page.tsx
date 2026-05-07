'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { FlowBuilder } from '@/components/flow-builder'
import { Button, Badge, Input } from '@/components/ui'
import { apiClient } from '@/lib/utils'
import { ArrowLeft, Play, Zap } from 'lucide-react'
import Link from 'next/link'
import type { FlowGraphDef } from '@runlet/types'

interface Flow {
  id: string; name: string; description?: string; status: string; graphDef: FlowGraphDef
}
interface Deployment { id: string; instanceName: string }

export default function FlowBuilderPage({ params }: { params: { workspaceId: string; flowId: string } }) {
  const { workspaceId, flowId } = params
  const router = useRouter()
  const [flow, setFlow] = useState<Flow | null>(null)
  const [deps, setDeps] = useState<Deployment[]>([])
  const [loading, setLoading] = useState(true)
  const [activating, setActivating] = useState(false)
  const [running, setRunning] = useState(false)
  const [name, setName] = useState('')

  const isNew = flowId === 'new'

  useEffect(() => {
    async function load() {
      const [depsRes] = await Promise.all([
        apiClient<{ data: Deployment[] }>(`/v1/workspaces/${workspaceId}/deployments`, { headers: { 'X-Workspace-Id': workspaceId } }),
      ])
      setDeps(depsRes.data)
      if (!isNew) {
        const flowRes = await apiClient<{ data: Flow }>(`/v1/workspaces/${workspaceId}/flows/${flowId}`, { headers: { 'X-Workspace-Id': workspaceId } })
        setFlow(flowRes.data)
        setName(flowRes.data.name)
      }
      setLoading(false)
    }
    load().catch(console.error)
  }, [workspaceId, flowId, isNew])

  async function handleSave(graphDef: FlowGraphDef) {
    if (isNew) {
      const res = await apiClient<{ data: Flow }>(`/v1/workspaces/${workspaceId}/flows`, {
        method: 'POST',
        body: JSON.stringify({ name: name || 'Untitled Flow', graphDef }),
        headers: { 'X-Workspace-Id': workspaceId },
      })
      router.replace(`/workspace/${workspaceId}/flows/${res.data.id}`)
    } else {
      await apiClient(`/v1/workspaces/${workspaceId}/flows/${flowId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name, graphDef }),
        headers: { 'X-Workspace-Id': workspaceId },
      })
    }
  }

  async function handleActivate() {
    setActivating(true)
    try {
      await apiClient(`/v1/workspaces/${workspaceId}/flows/${flowId}/activate`, { method: 'POST', headers: { 'X-Workspace-Id': workspaceId } })
      setFlow(f => f ? { ...f, status: 'active' } : f)
    } finally { setActivating(false) }
  }

  async function handleRun() {
    setRunning(true)
    try {
      const res = await apiClient<{ data: { flowRunId: string } }>(`/v1/workspaces/${workspaceId}/flows/${flowId}/runs`, {
        method: 'POST', body: JSON.stringify({ input: {} }),
        headers: { 'X-Workspace-Id': workspaceId },
      })
      router.push(`/workspace/${workspaceId}/flows/${flowId}/runs?runId=${res.data.flowRunId}`)
    } finally { setRunning(false) }
  }

  if (loading) return <div className="flex items-center justify-center h-full p-20 text-gray-600">Loading…</div>

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-3 bg-gray-950 border-b border-white/7 shrink-0">
        <Link href={`/workspace/${workspaceId}/flows`} className="text-gray-600 hover:text-gray-400">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <input
          className="flex-1 bg-transparent text-sm font-semibold text-white focus:outline-none placeholder-gray-600"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Flow name…"
        />
        {flow && <Badge status={flow.status} />}
        <div className="flex items-center gap-2">
          {flow && flow.status !== 'active' && (
            <Button size="sm" variant="secondary" onClick={handleActivate} loading={activating}>
              <Zap className="w-3.5 h-3.5 text-amber-400" /> Activate
            </Button>
          )}
          {flow && flow.status === 'active' && (
            <Button size="sm" variant="secondary" onClick={handleRun} loading={running}>
              <Play className="w-3.5 h-3.5 text-emerald-400" /> Run
            </Button>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-hidden">
        <FlowBuilder
          initialGraphDef={flow?.graphDef}
          deployments={deps}
          onSave={handleSave}
          onRun={flow?.status === 'active' ? handleRun : undefined}
        />
      </div>
    </div>
  )
}

'use client'
import { useState, useCallback, useRef } from 'react'
import ReactFlow, {
  addEdge, Background, Controls, MiniMap,
  useNodesState, useEdgesState,
  type Connection, type Edge, type Node,
  Handle, Position, NodeProps, EdgeProps, getBezierPath,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui'
import { Bot, GitBranch, User, Wand2, Plus, Save, Play, Trash2 } from 'lucide-react'
import type { FlowGraphDef } from '@runlet/types'

// ── Custom node types ─────────────────────────────────────────
function AgentNode({ data, selected }: NodeProps) {
  return (
    <div className={cn('bg-gray-900 border rounded-xl px-4 py-3 min-w-[160px] shadow-lg transition-all',
      selected ? 'border-brand-500/60 shadow-brand-500/10' : 'border-white/10')}>
      <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 !bg-brand-500 !border-2 !border-gray-900" />
      <div className="flex items-center gap-2 mb-1">
        <div className="w-6 h-6 rounded-lg bg-brand-500/20 flex items-center justify-center shrink-0">
          <Bot className="w-3 h-3 text-brand-400" />
        </div>
        <span className="text-xs font-medium text-gray-200 truncate max-w-[120px]">{data.label}</span>
      </div>
      <p className="text-xs text-gray-600">{data.deploymentId ? 'Agent' : 'Unbound'}</p>
      <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-brand-500 !border-2 !border-gray-900" />
    </div>
  )
}

function SubFlowNode({ data, selected }: NodeProps) {
  return (
    <div className={cn('bg-gray-900 border rounded-xl px-4 py-3 min-w-[160px] shadow-lg transition-all',
      selected ? 'border-amber-500/60 shadow-amber-500/10' : 'border-white/10')}>
      <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 !bg-amber-500 !border-2 !border-gray-900" />
      <div className="flex items-center gap-2 mb-1">
        <div className="w-6 h-6 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
          <GitBranch className="w-3 h-3 text-amber-400" />
        </div>
        <span className="text-xs font-medium text-gray-200 truncate max-w-[120px]">{data.label}</span>
      </div>
      <p className="text-xs text-gray-600">Sub-flow</p>
      <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-amber-500 !border-2 !border-gray-900" />
    </div>
  )
}

function HumanReviewNode({ data, selected }: NodeProps) {
  return (
    <div className={cn('bg-gray-900 border rounded-xl px-4 py-3 min-w-[160px] shadow-lg transition-all',
      selected ? 'border-orange-500/60' : 'border-white/10')}>
      <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 !bg-orange-500 !border-2 !border-gray-900" />
      <div className="flex items-center gap-2 mb-1">
        <div className="w-6 h-6 rounded-lg bg-orange-500/20 flex items-center justify-center shrink-0">
          <User className="w-3 h-3 text-orange-400" />
        </div>
        <span className="text-xs font-medium text-gray-200 truncate max-w-[120px]">{data.label}</span>
      </div>
      <p className="text-xs text-gray-600">Human Review Gate</p>
      <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-orange-500 !border-2 !border-gray-900" />
    </div>
  )
}

function TransformNode({ data, selected }: NodeProps) {
  return (
    <div className={cn('bg-gray-900 border rounded-xl px-4 py-3 min-w-[160px] shadow-lg transition-all',
      selected ? 'border-teal-500/60' : 'border-white/10')}>
      <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 !bg-teal-500 !border-2 !border-gray-900" />
      <div className="flex items-center gap-2 mb-1">
        <div className="w-6 h-6 rounded-lg bg-teal-500/20 flex items-center justify-center shrink-0">
          <Wand2 className="w-3 h-3 text-teal-400" />
        </div>
        <span className="text-xs font-medium text-gray-200 truncate max-w-[120px]">{data.label}</span>
      </div>
      <p className="text-xs text-gray-600">Transform</p>
      <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-teal-500 !border-2 !border-gray-900" />
    </div>
  )
}

// ── Custom edge with label ─────────────────────────────────────
function ConditionEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd }: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
  return (
    <>
      <path id={id} className="react-flow__edge-path" d={edgePath} markerEnd={markerEnd} stroke="rgba(255,255,255,0.15)" strokeWidth={1.5} fill="none" />
      {data?.condition && (
        <foreignObject width={120} height={30} x={labelX - 60} y={labelY - 15}>
          <div className="flex items-center justify-center h-full">
            <span className="text-xs bg-gray-900 border border-white/10 rounded-md px-1.5 py-0.5 text-gray-500 font-mono truncate max-w-full">
              {String(data.condition).slice(0, 20)}
            </span>
          </div>
        </foreignObject>
      )}
    </>
  )
}

const nodeTypes = {
  agent_deployment: AgentNode,
  sub_flow: SubFlowNode,
  human_review_gate: HumanReviewNode,
  transform: TransformNode,
}

const edgeTypes = { condition: ConditionEdge }

// ── Graph def ↔ React Flow conversion ─────────────────────────
function graphDefToRF(graphDef: FlowGraphDef): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = graphDef.nodes.map(n => ({
    id: n.nodeId,
    type: n.nodeType,
    position: n.position ?? { x: Math.random() * 400, y: Math.random() * 300 },
    data: { label: n.label, deploymentId: n.deploymentId, flowId: n.flowId, config: n.config },
  }))
  const edges: Edge[] = graphDef.edges.map(e => ({
    id: e.edgeId,
    source: e.from,
    target: e.to,
    type: 'condition',
    data: { condition: e.condition, dataMapping: e.dataMapping },
    animated: e.executionMode === 'parallel',
  }))
  return { nodes, edges }
}

function rfToGraphDef(nodes: Node[], edges: Edge[]): FlowGraphDef {
  return {
    nodes: nodes.map(n => ({
      nodeId: n.id,
      nodeType: n.type as 'agent_deployment' | 'sub_flow' | 'human_review_gate' | 'transform',
      label: (n.data as { label: string }).label,
      position: n.position,
      deploymentId: (n.data as { deploymentId?: string }).deploymentId,
      flowId: (n.data as { flowId?: string }).flowId,
      config: (n.data as { config?: Record<string, unknown> }).config,
    })),
    edges: edges.map(e => ({
      edgeId: e.id,
      from: e.source,
      to: e.target,
      condition: (e.data as { condition?: string } | undefined)?.condition,
      executionMode: e.animated ? 'parallel' : 'sequential',
    })),
  }
}

// ── Main Flow Builder ─────────────────────────────────────────
interface FlowBuilderProps {
  initialGraphDef?: FlowGraphDef
  deployments: Array<{ id: string; instanceName: string }>
  onSave: (graphDef: FlowGraphDef) => Promise<void>
  onRun?: () => void
}

export function FlowBuilder({ initialGraphDef, deployments: deps, onSave, onRun }: FlowBuilderProps) {
  const initial = initialGraphDef ?? { nodes: [], edges: [] }
  const { nodes: initNodes, edges: initEdges } = graphDefToRF(initial)

  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges)
  const [saving, setSaving] = useState(false)
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const nodeCounter = useRef(nodes.length)

  const onConnect = useCallback(
    (params: Connection) => setEdges(es => addEdge({ ...params, type: 'condition', data: {} }, es)),
    [setEdges]
  )

  function addNode(type: string) {
    const id = `n${++nodeCounter.current}`
    const labels: Record<string, string> = {
      agent_deployment: 'New Agent',
      sub_flow: 'Sub-flow',
      human_review_gate: 'Human Review',
      transform: 'Transform',
    }
    setNodes(ns => [...ns, {
      id,
      type,
      position: { x: 100 + nodeCounter.current * 60, y: 100 + (nodeCounter.current % 3) * 120 },
      data: { label: labels[type] ?? type },
    }])
  }

  function deleteSelected() {
    if (!selectedNode) return
    setNodes(ns => ns.filter(n => n.id !== selectedNode.id))
    setEdges(es => es.filter(e => e.source !== selectedNode.id && e.target !== selectedNode.id))
    setSelectedNode(null)
  }

  async function handleSave() {
    setSaving(true)
    try { await onSave(rfToGraphDef(nodes, edges)) }
    finally { setSaving(false) }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-950 border-b border-white/7">
        <span className="text-xs text-gray-600 font-medium mr-2">Add node:</span>
        <button onClick={() => addNode('agent_deployment')}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-brand-500/10 text-brand-400 border border-brand-500/20 hover:bg-brand-500/15 transition-colors">
          <Bot className="w-3 h-3" /> Agent
        </button>
        <button onClick={() => addNode('sub_flow')}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/15 transition-colors">
          <GitBranch className="w-3 h-3" /> Sub-flow
        </button>
        <button onClick={() => addNode('human_review_gate')}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-orange-500/10 text-orange-400 border border-orange-500/20 hover:bg-orange-500/15 transition-colors">
          <User className="w-3 h-3" /> Review Gate
        </button>
        <button onClick={() => addNode('transform')}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-teal-500/10 text-teal-400 border border-teal-500/20 hover:bg-teal-500/15 transition-colors">
          <Wand2 className="w-3 h-3" /> Transform
        </button>
        <div className="ml-auto flex items-center gap-2">
          {selectedNode && (
            <button onClick={deleteSelected}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/15 transition-colors">
              <Trash2 className="w-3 h-3" /> Delete
            </button>
          )}
          {onRun && (
            <button onClick={onRun}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/15 transition-colors">
              <Play className="w-3 h-3" /> Run
            </button>
          )}
          <Button size="sm" onClick={handleSave} loading={saving}>
            <Save className="w-3 h-3" /> Save
          </Button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => setSelectedNode(node)}
          onPaneClick={() => setSelectedNode(null)}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
          style={{ background: '#0a0a0f' }}
        >
          <Background color="rgba(255,255,255,0.03)" gap={24} />
          <Controls className="!bg-gray-900 !border-white/10 !shadow-none" />
          <MiniMap
            nodeColor={(n) => {
              const colors: Record<string, string> = {
                agent_deployment: '#7B6EF6', sub_flow: '#F59E0B',
                human_review_gate: '#F97316', transform: '#14B8A6',
              }
              return colors[n.type ?? ''] ?? '#6b7280'
            }}
            className="!bg-gray-900 !border-white/10"
          />
        </ReactFlow>

        {/* Node inspector panel */}
        {selectedNode && (
          <div className="absolute right-3 top-3 w-56 bg-gray-900 border border-white/10 rounded-xl p-3 shadow-xl">
            <p className="text-xs font-semibold text-gray-300 mb-2">Node Inspector</p>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-gray-600">Label</label>
                <input
                  className="w-full text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-gray-200 focus:outline-none focus:border-brand-500/50 mt-0.5"
                  value={(selectedNode.data as { label: string }).label}
                  onChange={e => setNodes(ns => ns.map(n =>
                    n.id === selectedNode.id ? { ...n, data: { ...n.data, label: e.target.value } } : n
                  ))}
                />
              </div>
              {selectedNode.type === 'agent_deployment' && (
                <div>
                  <label className="text-xs text-gray-600">Agent Deployment</label>
                  <select
                    className="w-full text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-gray-200 focus:outline-none mt-0.5"
                    value={(selectedNode.data as { deploymentId?: string }).deploymentId ?? ''}
                    onChange={e => setNodes(ns => ns.map(n =>
                      n.id === selectedNode.id ? { ...n, data: { ...n.data, deploymentId: e.target.value } } : n
                    ))}
                  >
                    <option value="" className="bg-gray-900">Select deployment…</option>
                    {deps.map(d => <option key={d.id} value={d.id} className="bg-gray-900">{d.instanceName}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createDb, schema } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Bot, Plug, Shield, Star, Download, CheckCircle, AlertCircle } from 'lucide-react'

const VERTICAL_LABELS: Record<string, string> = {
    customer_support: 'Customer Support',
    engineering: 'Engineering',
    finance: 'Finance',
    hr: 'HR',
    sales: 'Sales',
}

export default async function AgentDetailPage({
    params,
    searchParams,
}: {
    params: { slug: string }
    searchParams: { workspaceId?: string }
}) {
    const session = await getServerSession(authOptions)
    const db = createDb()

    const agent = await db.query.agents.findFirst({
        where: and(
            eq(schema.agents.slug, params.slug),
            eq(schema.agents.status, 'published')
        ),
    })

    if (!agent) notFound()

    const versions = await db.select().from(schema.agentVersions)
        .where(and(
            eq(schema.agentVersions.agentId, agent.id),
            eq(schema.agentVersions.status, 'published')
        ))

    const latestVersion = versions[0]
    const workspaceId = searchParams.workspaceId

    // Check if already installed in workspace
    let alreadyInstalled = false
    if (workspaceId) {
        const existing = await db.query.workspaceAgents.findFirst({
            where: and(
                eq(schema.workspaceAgents.workspaceId, workspaceId),
                eq(schema.workspaceAgents.agentId, agent.id)
            ),
        })
        alreadyInstalled = !!existing
    }

    // Check workspace connectors for compatibility
    let connectorStatus: Record<string, 'connected' | 'missing'> = {}
    if (workspaceId && latestVersion) {
        const workspaceConnectors = await db.select().from(schema.connectors)
            .where(eq(schema.connectors.workspaceId, workspaceId))

        const requiredConnectors = latestVersion.requiredConnectors as Array<{ provider: string; scopes: string[] }>
        for (const req of requiredConnectors) {
            const found = workspaceConnectors.find(c => c.provider === req.provider)
            connectorStatus[req.provider] = found ? 'connected' : 'missing'
        }
    }

    const requiredConnectors = latestVersion
        ? (latestVersion.requiredConnectors as Array<{ provider: string; scopes: string[]; optional?: boolean }>)
        : []

    return (
        <div className="min-h-screen bg-gray-950">
            {/* Header */}
            <div className="border-b border-white/7 px-6 py-3 flex items-center gap-4 sticky top-0 bg-gray-950/95 backdrop-blur z-10">
                <Link href={`/marketplace${workspaceId ? `?workspaceId=${workspaceId}` : ''}`}
                    className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors">
                    <ArrowLeft className="w-3.5 h-3.5" /> Marketplace
                </Link>
            </div>

            <div className="max-w-4xl mx-auto px-6 py-8">
                {/* Agent header */}
                <div className="flex items-start gap-5 mb-8">
                    <div className="w-16 h-16 rounded-2xl bg-brand-500/15 flex items-center justify-center shrink-0">
                        <Bot className="w-8 h-8 text-brand-400" />
                    </div>
                    <div className="flex-1">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h1 className="text-2xl font-bold text-white mb-1">{agent.displayName}</h1>
                                <p className="text-gray-500">{agent.tagline}</p>
                                <div className="flex items-center gap-2 mt-2">
                                    <span className="text-xs px-2 py-0.5 bg-brand-500/10 text-brand-400 border border-brand-500/20 rounded-md">
                                        {VERTICAL_LABELS[agent.vertical] ?? agent.vertical}
                                    </span>
                                    <span className="text-xs text-gray-600">{agent.category}</span>
                                    <span className="flex items-center gap-1 text-xs text-gray-600">
                                        <Star className="w-3 h-3" /> {agent.starCount}
                                    </span>
                                    <span className="flex items-center gap-1 text-xs text-gray-600">
                                        <Download className="w-3 h-3" /> {agent.installCount} installs
                                    </span>
                                </div>
                            </div>

                            {/* Add to workspace button */}
                            {workspaceId ? (
                                alreadyInstalled ? (
                                    <Link href={`/workspace/${workspaceId}/agents/install?agentId=${agent.id}`}
                                        className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg text-sm font-medium">
                                        <CheckCircle className="w-4 h-4" /> Already installed
                                    </Link>
                                ) : (
                                    <form action={async () => {
                                        'use server'
                                        // Install agent to workspace
                                        redirect(`/workspace/${workspaceId}/agents`)
                                    }}>
                                        <Link href={`/workspace/${workspaceId}/agents/install?agentId=${agent.id}`}
                                            className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-400 text-white rounded-lg text-sm font-medium transition-colors">
                                            <Download className="w-4 h-4" /> Add to Workspace
                                        </Link>
                                    </form>
                                )
                            ) : (
                                <Link href="/login"
                                    className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-400 text-white rounded-lg text-sm font-medium transition-colors">
                                    Sign in to install
                                </Link>
                            )}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-6">
                    {/* Main content */}
                    <div className="col-span-2 space-y-6">
                        {/* Description */}
                        <div className="bg-white/3 border border-white/7 rounded-xl p-5">
                            <h2 className="text-sm font-semibold text-gray-200 mb-3">About</h2>
                            <p className="text-sm text-gray-400 leading-relaxed">
                                {agent.descriptionLong ?? agent.tagline}
                            </p>
                        </div>

                        {/* Input/Output schema */}
                        {latestVersion && (
                            <div className="bg-white/3 border border-white/7 rounded-xl p-5">
                                <h2 className="text-sm font-semibold text-gray-200 mb-3">Input Schema</h2>
                                <pre className="text-xs text-gray-500 font-mono overflow-x-auto bg-black/30 rounded-lg p-3">
                                    {JSON.stringify(latestVersion.inputSchema, null, 2)}
                                </pre>
                            </div>
                        )}

                        {/* Tags */}
                        {(agent.tags ?? []).length > 0 && (
                            <div className="bg-white/3 border border-white/7 rounded-xl p-5">
                                <h2 className="text-sm font-semibold text-gray-200 mb-3">Tags</h2>
                                <div className="flex flex-wrap gap-2">
                                    {(agent.tags ?? []).map(tag => (
                                        <span key={tag} className="text-xs px-2.5 py-1 bg-white/5 text-gray-400 rounded-lg border border-white/7">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-4">
                        {/* Required connectors */}
                        <div className="bg-white/3 border border-white/7 rounded-xl p-4">
                            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                <Plug className="w-3.5 h-3.5" /> Required Connectors
                            </h3>
                            {requiredConnectors.length === 0 ? (
                                <p className="text-xs text-gray-600">None required</p>
                            ) : (
                                <div className="space-y-2">
                                    {requiredConnectors.map(req => (
                                        <div key={req.provider} className="flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-full shrink-0 ${workspaceId
                                                ? connectorStatus[req.provider] === 'connected' ? 'bg-emerald-400' : 'bg-red-400'
                                                : 'bg-gray-600'
                                                }`} />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-medium text-gray-300 capitalize">{req.provider}</p>
                                                <p className="text-xs text-gray-600 truncate">{req.scopes.join(', ')}</p>
                                            </div>
                                            {workspaceId && connectorStatus[req.provider] === 'connected' && (
                                                <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                            )}
                                            {workspaceId && connectorStatus[req.provider] === 'missing' && (
                                                <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Guardrails */}
                        {latestVersion && (
                            <div className="bg-white/3 border border-white/7 rounded-xl p-4">
                                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                    <Shield className="w-3.5 h-3.5" /> Guardrails
                                </h3>
                                <div className="space-y-1.5">
                                    {(latestVersion.guardrailRules as Array<{ type: string; severity: string }>).map((rule, i) => (
                                        <div key={i} className="flex items-center gap-2">
                                            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${rule.severity === 'block' ? 'bg-red-400' : 'bg-amber-400'}`} />
                                            <span className="text-xs text-gray-500 capitalize">{rule.type.replace(/_/g, ' ')}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Version info */}
                        {latestVersion && (
                            <div className="bg-white/3 border border-white/7 rounded-xl p-4">
                                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Version</h3>
                                <p className="text-sm font-mono text-white">v{latestVersion.semver}</p>
                                <p className="text-xs text-gray-600 mt-1">
                                    Model: {(latestVersion.modelConfig as { modelId: string }).modelId}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

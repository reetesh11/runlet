import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { createDb, schema } from '@/lib/db'
import { eq, and, ilike, or } from 'drizzle-orm'
import Link from 'next/link'
import { Store, Search, ArrowLeft, Bot } from 'lucide-react'

const VERTICAL_LABELS: Record<string, string> = {
    customer_support: 'Customer Support',
    engineering: 'Engineering',
    finance: 'Finance',
    hr: 'HR',
    sales: 'Sales',
    marketing: 'Marketing',
    legal: 'Legal',
    it_security: 'IT & Security',
    data_analytics: 'Analytics',
    operations: 'Operations',
}

const VERTICAL_COLORS: Record<string, string> = {
    customer_support: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    engineering: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    finance: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    hr: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
    sales: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    marketing: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
}

export default async function MarketplacePage({
    searchParams,
}: {
    searchParams: { q?: string; vertical?: string }
}) {
    const session = await getServerSession(authOptions)
    const db = createDb()

    const conditions = [eq(schema.agents.status, 'published')]
    if (searchParams.vertical) {
        conditions.push(eq(schema.agents.vertical, searchParams.vertical))
    }
    if (searchParams.q) {
        conditions.push(or(
            ilike(schema.agents.displayName, `%${searchParams.q}%`),
            ilike(schema.agents.tagline, `%${searchParams.q}%`),
        )!)
    }

    const agents = await db.select().from(schema.agents).where(and(...conditions))

    // Get workspace for back link + add button
    const userId = session ? (session.user as { id: string }).id : null
    let workspaceId: string | null = null
    if (userId) {
        const membership = await db.query.workspaceMembers.findFirst({
            where: (wm, { eq }) => eq(wm.userId, userId),
        })
        workspaceId = membership?.workspaceId ?? null
    }

    return (
        <div className="min-h-screen bg-gray-950">
            {/* Header */}
            <div className="border-b border-white/7 px-6 py-3 flex items-center gap-4 sticky top-0 bg-gray-950/95 backdrop-blur z-10">
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-brand-500 rounded-lg flex items-center justify-center">
                        <Store className="w-3.5 h-3.5 text-white" />
                    </div>
                    <span className="font-bold text-white text-sm">Marketplace</span>
                </div>
                <form className="flex-1 max-w-md relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" />
                    <input
                        name="q"
                        defaultValue={searchParams.q}
                        placeholder="Search agents..."
                        className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand-500/50"
                    />
                </form>
                {workspaceId && (
                    <Link href={`/workspace/${workspaceId}/dashboard`}
                        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors ml-auto">
                        <ArrowLeft className="w-3.5 h-3.5" /> Back to workspace
                    </Link>
                )}
            </div>

            <div className="flex">
                {/* Sidebar filters */}
                <aside className="w-48 shrink-0 p-4 border-r border-white/7 min-h-screen sticky top-12">
                    <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">Vertical</p>
                    <div className="space-y-0.5">
                        <Link href="/marketplace"
                            className={`block text-xs px-2.5 py-1.5 rounded-lg transition-colors ${!searchParams.vertical ? 'bg-brand-500/15 text-brand-400' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}>
                            All
                        </Link>
                        {Object.entries(VERTICAL_LABELS).map(([key, label]) => (
                            <Link key={key} href={`/marketplace?vertical=${key}${searchParams.q ? `&q=${searchParams.q}` : ''}`}
                                className={`block text-xs px-2.5 py-1.5 rounded-lg transition-colors ${searchParams.vertical === key ? 'bg-brand-500/15 text-brand-400' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}>
                                {label}
                            </Link>
                        ))}
                    </div>
                </aside>

                {/* Agent grid */}
                <main className="flex-1 p-6">
                    <p className="text-xs text-gray-600 mb-4">{agents.length} agent{agents.length !== 1 ? 's' : ''}</p>
                    {agents.length === 0 ? (
                        <div className="text-center py-20">
                            <Bot className="w-10 h-10 text-gray-700 mx-auto mb-3" />
                            <p className="text-sm text-gray-600">No agents found</p>
                            <Link href="/marketplace" className="text-xs text-brand-400 hover:text-brand-300 mt-2 inline-block">
                                Clear filters
                            </Link>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {agents.map(agent => (
                                <Link key={agent.id}
                                    href={`/marketplace/${agent.slug}${workspaceId ? `?workspaceId=${workspaceId}` : ''}`}
                                    className="bg-white/3 border border-white/7 hover:border-brand-500/30 rounded-xl p-4 transition-all hover:bg-white/5 group block">
                                    <div className="flex items-start justify-between gap-3 mb-3">
                                        <div className="w-10 h-10 rounded-xl bg-brand-500/15 flex items-center justify-center shrink-0">
                                            <Bot className="w-5 h-5 text-brand-400" />
                                        </div>
                                        <span className={`text-xs px-2 py-0.5 rounded-md border shrink-0 ${VERTICAL_COLORS[agent.vertical] ?? 'bg-gray-500/10 text-gray-400 border-gray-500/20'}`}>
                                            {VERTICAL_LABELS[agent.vertical] ?? agent.vertical}
                                        </span>
                                    </div>
                                    <h3 className="text-sm font-semibold text-white mb-1 group-hover:text-brand-300 transition-colors">
                                        {agent.displayName}
                                    </h3>
                                    <p className="text-xs text-gray-500 line-clamp-2 mb-3">{agent.tagline}</p>
                                    <div className="flex items-center justify-between">
                                        <div className="flex gap-1 flex-wrap">
                                            {(agent.tags ?? []).slice(0, 3).map(tag => (
                                                <span key={tag} className="text-xs px-1.5 py-0.5 bg-white/5 text-gray-600 rounded">
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                        <span className="text-xs text-brand-400 group-hover:text-brand-300 shrink-0">
                                            View →
                                        </span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </main>
            </div>
        </div>
    )
}

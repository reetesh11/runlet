import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { createDb, schema } from '@/lib/db'
import { eq, and, ilike, or } from 'drizzle-orm'
import Link from 'next/link'
import { Bot, Search, ArrowLeft, Star, Download, Zap } from 'lucide-react'

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

const ICONS = ['🎫', '🔍', '📋', '🔀', '📚', '⚡', '🤖', '📊']

export default async function MarketplacePage({ searchParams }: { searchParams: { q?: string; vertical?: string } }) {
    const session = await getServerSession(authOptions)
    const db = createDb()

    const conditions = [eq(schema.agents.status, 'published')]
    if (searchParams.vertical) conditions.push(eq(schema.agents.vertical, searchParams.vertical))
    if (searchParams.q) conditions.push(or(ilike(schema.agents.displayName, `%${searchParams.q}%`), ilike(schema.agents.tagline, `%${searchParams.q}%`))!)

    const agents = await db.select().from(schema.agents).where(and(...conditions))

    const userId = session ? (session.user as { id: string }).id : null
    let workspaceId: string | null = null
    if (userId) {
        const m = await db.query.workspaceMembers.findFirst({ where: (wm, { eq }) => eq(wm.userId, userId) })
        workspaceId = m?.workspaceId ?? null
    }

    return (
        <div className="min-h-screen bg-gray-950">
            <header className="sticky top-0 z-20 bg-gray-950/95 backdrop-blur-sm border-b border-white/7">
                <div className="flex items-center gap-4 px-6 h-14">
                    <div className="flex items-center gap-2.5 shrink-0">
                        <div className="w-7 h-7 bg-brand-500 rounded-lg flex items-center justify-center">
                            <Zap className="w-3.5 h-3.5 text-white" />
                        </div>
                        <span className="font-semibold text-white text-sm">Marketplace</span>
                    </div>
                    <form className="flex-1 max-w-xl mx-auto" method="GET">
                        {searchParams.vertical && <input type="hidden" name="vertical" value={searchParams.vertical} />}
                        <div className="relative flex items-center">
                            <Search className="absolute left-3 w-4 h-4 text-gray-500 pointer-events-none" />
                            <input name="q" defaultValue={searchParams.q} placeholder="Search agents..."
                                className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand-500/50 transition-all" />
                        </div>
                    </form>
                    {workspaceId && (
                        <Link href={`/workspace/${workspaceId}/dashboard`}
                            className="shrink-0 flex items-center gap-2 px-3 py-1.5 bg-brand-500/10 hover:bg-brand-500/15 border border-brand-500/20 rounded-lg text-sm text-brand-400 hover:text-brand-300 font-medium transition-all">
                            <ArrowLeft className="w-3.5 h-3.5" /> Dashboard
                        </Link>
                    )}
                </div>
            </header>

            <div className="flex">
                <aside className="w-52 shrink-0 border-r border-white/7 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto p-4">
                    <p className="text-xs font-semibold text-gray-600 uppercase tracking-widest mb-3 px-1">Vertical</p>
                    <nav className="space-y-0.5">
                        <Link href={`/marketplace${searchParams.q ? `?q=${searchParams.q}` : ''}`}
                            className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${!searchParams.vertical ? 'bg-brand-500/15 text-brand-300 font-medium' : 'text-gray-500 hover:text-gray-200 hover:bg-white/5'}`}>
                            <span>All</span>
                            <span className="text-xs text-gray-600">{agents.length}</span>
                        </Link>
                        {Object.entries(VERTICAL_LABELS).map(([key, label]) => (
                            <Link key={key} href={`/marketplace?vertical=${key}${searchParams.q ? `&q=${searchParams.q}` : ''}`}
                                className={`flex items-center px-3 py-2 rounded-lg text-sm transition-colors ${searchParams.vertical === key ? 'bg-brand-500/15 text-brand-300 font-medium' : 'text-gray-500 hover:text-gray-200 hover:bg-white/5'}`}>
                                {label}
                            </Link>
                        ))}
                    </nav>
                </aside>

                <main className="flex-1 p-6">
                    <div className="flex items-center justify-between mb-5">
                        <div>
                            <h1 className="text-lg font-bold text-white">
                                {searchParams.vertical ? (VERTICAL_LABELS[searchParams.vertical] ?? searchParams.vertical) : 'All Agents'}
                            </h1>
                            <p className="text-xs text-gray-600 mt-0.5">{agents.length} agent{agents.length !== 1 ? 's' : ''}{searchParams.q && ` matching "${searchParams.q}"`}</p>
                        </div>
                        {(searchParams.q || searchParams.vertical) && (
                            <Link href="/marketplace" className="text-xs text-brand-400 hover:text-brand-300">Clear filters ×</Link>
                        )}
                    </div>

                    {agents.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-24 text-center">
                            <Bot className="w-10 h-10 text-gray-700 mb-3" />
                            <p className="text-sm text-gray-500">No agents found</p>
                            <Link href="/marketplace" className="text-xs text-brand-400 hover:text-brand-300 mt-2">Clear filters</Link>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {agents.map((agent, i) => (
                                <Link key={agent.id}
                                    href={`/marketplace/${agent.slug}${workspaceId ? `?workspaceId=${workspaceId}` : ''}`}
                                    className="group bg-white/3 hover:bg-white/5 border border-white/7 hover:border-brand-500/25 rounded-2xl p-5 transition-all flex flex-col gap-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="w-11 h-11 rounded-xl bg-brand-500/10 border border-brand-500/15 flex items-center justify-center text-xl shrink-0">
                                            {ICONS[i % ICONS.length]}
                                        </div>
                                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 ${VERTICAL_COLORS[agent.vertical] ?? 'bg-gray-500/10 text-gray-400 border-gray-500/20'}`}>
                                            {VERTICAL_LABELS[agent.vertical] ?? agent.vertical}
                                        </span>
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="text-sm font-semibold text-white mb-1 group-hover:text-brand-300 transition-colors">{agent.displayName}</h3>
                                        <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{agent.tagline}</p>
                                    </div>
                                    {(agent.tags ?? []).length > 0 && (
                                        <div className="flex gap-1.5 flex-wrap">
                                            {(agent.tags ?? []).slice(0, 3).map(tag => (
                                                <span key={tag} className="text-xs px-2 py-0.5 bg-white/5 text-gray-600 rounded-md border border-white/5">{tag}</span>
                                            ))}
                                        </div>
                                    )}
                                    <div className="flex items-center justify-between pt-2 border-t border-white/5">
                                        <div className="flex items-center gap-3">
                                            <span className="flex items-center gap-1 text-xs text-gray-600"><Star className="w-3 h-3" /> {agent.starCount}</span>
                                            <span className="flex items-center gap-1 text-xs text-gray-600"><Download className="w-3 h-3" /> {agent.installCount}</span>
                                        </div>
                                        <span className="text-xs font-medium text-brand-400 group-hover:text-brand-300">View →</span>
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

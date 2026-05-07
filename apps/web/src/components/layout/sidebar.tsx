'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Bot, GitBranch, Plug, Settings,
  Store, Code2, LogOut, ChevronDown, Play,
} from 'lucide-react'

interface NavItem { label: string; href: string; icon: React.ReactNode; exact?: boolean }

const NAV: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard className="w-4 h-4" />, exact: true },
  { label: 'Agents', href: '/agents', icon: <Bot className="w-4 h-4" /> },
  { label: 'Flows', href: '/flows', icon: <GitBranch className="w-4 h-4" /> },
  { label: 'Connectors', href: '/connectors', icon: <Plug className="w-4 h-4" /> },
  { label: 'Settings', href: '/settings', icon: <Settings className="w-4 h-4" /> },
]

export function Sidebar({ workspaceId }: { workspaceId: string }) {
  const pathname = usePathname()
  const { data: session } = useSession()

  function isActive(item: NavItem) {
    const path = `/workspace/${workspaceId}${item.href}`
    return item.exact ? pathname === path : pathname.startsWith(path)
  }

  async function handleLogout() {
    await signOut({ callbackUrl: '/login' })
  }

  return (
    <aside className="fixed left-0 top-0 h-screen w-56 bg-gray-950 border-r border-white/7 flex flex-col z-50">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-white/7">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 bg-brand-500 rounded-lg flex items-center justify-center">
            <Play className="w-3.5 h-3.5 text-white fill-white" />
          </div>
          <span className="font-bold text-white text-base tracking-tight">
            run<span className="text-brand-400">let</span>
          </span>
        </Link>
      </div>

      {/* Workspace selector */}
      <div className="px-3 py-2 border-b border-white/7">
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/3">
          <div className="w-5 h-5 bg-brand-500/20 rounded flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-brand-400">W</span>
          </div>
          <span className="text-xs text-gray-300 truncate flex-1">My Workspace</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {NAV.map(item => (
          <Link
            key={item.href}
            href={`/workspace/${workspaceId}${item.href}`}
            className={cn(
              'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
              isActive(item)
                ? 'bg-brand-500/15 text-brand-300 border border-brand-500/20'
                : 'text-gray-500 hover:text-gray-200 hover:bg-white/5'
            )}
          >
            {item.icon}
            {item.label}
          </Link>
        ))}

        <div className="pt-3 mt-3 border-t border-white/7">
          <p className="px-3 mb-1 text-xs font-semibold text-gray-600 uppercase tracking-wider">Explore</p>
          <Link href="/marketplace"
            className={cn('flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
              pathname.startsWith('/marketplace')
                ? 'bg-brand-500/15 text-brand-300 border border-brand-500/20'
                : 'text-gray-500 hover:text-gray-200 hover:bg-white/5')}>
            <Store className="w-4 h-4" />
            Marketplace
          </Link>
          <Link href="/studio"
            className={cn('flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
              pathname.startsWith('/studio')
                ? 'bg-brand-500/15 text-brand-300 border border-brand-500/20'
                : 'text-gray-500 hover:text-gray-200 hover:bg-white/5')}>
            <Code2 className="w-4 h-4" />
            Agent Studio
          </Link>
        </div>
      </nav>

      {/* User + Logout */}
      <div className="px-3 py-3 border-t border-white/7">
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg">
          <div className="w-6 h-6 rounded-full bg-brand-500/20 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-brand-400">
              {session?.user?.name?.[0]?.toUpperCase() ?? 'U'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-300 truncate">{session?.user?.name ?? 'User'}</p>
            <p className="text-xs text-gray-600 truncate">{session?.user?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            title="Sign out"
            className="text-gray-600 hover:text-red-400 transition-colors p-1 rounded"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  )
}

export function WorkspaceLayout({ children, workspaceId }: { children: React.ReactNode; workspaceId: string }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar workspaceId={workspaceId} />
      <main className="ml-56 flex-1 min-h-screen">
        {children}
      </main>
    </div>
  )
}

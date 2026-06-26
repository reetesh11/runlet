import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { createDb, schema } from '@/lib/db'
import { formatDate } from '@/lib/utils'
import Link from 'next/link'
import { Settings } from 'lucide-react'

const PLAN_COLORS: Record<string, string> = {
  free: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  pro: 'bg-brand-500/10 text-brand-400 border-brand-500/20',
  enterprise: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
}

export default async function SettingsPage({ params }: { params: { workspaceId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const { workspaceId } = params
  const db = createDb()

  const workspaceRows = await db
    .select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, workspaceId))
    .limit(1)

  const workspace = workspaceRows[0]
  if (!workspace) redirect('/')

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <Settings className="w-5 h-5 text-gray-500" />
        <h1 className="text-xl font-bold text-white">Settings</h1>
      </div>

      {/* Tab nav */}
      <div className="flex items-center gap-1 border-b border-white/7 mb-6">
        {[
          { label: 'General', href: `/workspace/${workspaceId}/settings` },
          { label: 'API Keys', href: `/workspace/${workspaceId}/settings/secrets` },
          { label: 'Connectors', href: `/workspace/${workspaceId}/settings/connectors` },
          { label: 'Team', href: `/workspace/${workspaceId}/settings/team` },
        ].map(tab => (
          <Link key={tab.href} href={tab.href}
            className={`px-4 py-2 text-sm font-medium transition-colors ${tab.href === `/workspace/${workspaceId}/settings` ? 'text-brand-400 border-b-2 border-brand-500 -mb-px' : 'text-gray-500 hover:text-gray-300'}`}>
            {tab.label}
          </Link>
        ))}
      </div>

      {/* General info */}
      <div className="max-w-xl space-y-4">
        <div className="bg-white/3 border border-white/7 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-200 mb-4">Workspace Information</h2>

          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Name</p>
              <p className="text-sm text-gray-200">{workspace.name}</p>
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Slug</p>
              <p className="text-sm text-gray-200 font-mono">{workspace.slug}</p>
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Plan</p>
              <span
                className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md border capitalize ${
                  PLAN_COLORS[workspace.plan] ?? PLAN_COLORS.free
                }`}
              >
                {workspace.plan}
              </span>
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Workspace ID</p>
              <p className="text-xs text-gray-600 font-mono">{workspace.id}</p>
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Created</p>
              <p className="text-sm text-gray-400">{formatDate(workspace.createdAt)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white/3 border border-white/7 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-200 mb-1">Danger Zone</h2>
          <p className="text-xs text-gray-600 mb-4">
            Destructive actions cannot be undone. Contact support to delete your workspace.
          </p>
          <button
            disabled
            className="px-3 py-2 text-xs font-medium text-red-400 border border-red-500/20 rounded-lg opacity-50 cursor-not-allowed"
          >
            Delete Workspace
          </button>
        </div>
      </div>
    </div>
  )
}

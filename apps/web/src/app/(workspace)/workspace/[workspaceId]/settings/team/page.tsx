import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { createDb, schema } from '@/lib/db'
import { formatDate, statusBg } from '@/lib/utils'
import Link from 'next/link'
import { Settings } from 'lucide-react'
import { InviteMemberForm } from '../invite-client'

const ROLE_COLORS: Record<string, string> = {
  owner: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  admin: 'bg-brand-500/10 text-brand-300 border-brand-500/20',
  developer: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  operator: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
  viewer: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
}

export default async function TeamSettingsPage({ params }: { params: { workspaceId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const { workspaceId } = params
  const db = createDb()

  const memberRows = await db
    .select({ member: schema.workspaceMembers, user: schema.users })
    .from(schema.workspaceMembers)
    .innerJoin(schema.users, eq(schema.workspaceMembers.userId, schema.users.id))
    .where(eq(schema.workspaceMembers.workspaceId, workspaceId))
    .orderBy(schema.workspaceMembers.createdAt)

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <Settings className="w-5 h-5 text-gray-500" />
        <h1 className="text-xl font-bold text-white">Settings</h1>
      </div>

      {/* Tab nav */}
      <div className="flex items-center gap-1 border-b border-white/7 mb-6">
        <Link
          href={`/workspace/${workspaceId}/settings`}
          className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-300 transition-colors"
        >
          General
        </Link>
        <Link
          href={`/workspace/${workspaceId}/settings/team`}
          className="px-4 py-2 text-sm font-medium text-brand-400 border-b-2 border-brand-500 -mb-px"
        >
          Team
        </Link>
      </div>

      <div className="max-w-2xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-200">Team Members</h2>
            <p className="text-xs text-gray-600 mt-0.5">
              {memberRows.length} member{memberRows.length !== 1 ? 's' : ''}
            </p>
          </div>
          <InviteMemberForm workspaceId={workspaceId} />
        </div>

        <div className="bg-white/3 border border-white/7 rounded-xl overflow-hidden">
          {memberRows.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-gray-500">No members yet</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/7">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">
                    Member
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">
                    Role
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 hidden md:table-cell">
                    Joined
                  </th>
                </tr>
              </thead>
              <tbody>
                {memberRows.map(({ member, user }) => {
                  const initial = (user.name ?? user.email ?? '?')[0]!.toUpperCase()
                  return (
                    <tr
                      key={member.id}
                      className="border-b border-white/5 last:border-0 hover:bg-white/2 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full bg-brand-500/20 flex items-center justify-center shrink-0">
                            <span className="text-xs font-bold text-brand-400">{initial}</span>
                          </div>
                          <div>
                            <p className="text-sm text-gray-200">
                              {user.name ?? <span className="text-gray-500 italic">No name</span>}
                            </p>
                            <p className="text-xs text-gray-500">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md border capitalize ${
                            ROLE_COLORS[member.role] ?? ROLE_COLORS.viewer
                          }`}
                        >
                          {member.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <p className="text-xs text-gray-500">{formatDate(member.createdAt)}</p>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

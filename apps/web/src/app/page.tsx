import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from './api/auth/[...nextauth]/route'
import { createDb, schema } from '@/lib/db'
import { generateId } from '@runlet/utils'

export default async function RootPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')

  const userId = (session.user as { id: string }).id
  const db = createDb()
  try {

    let membership = await db.query.workspaceMembers.findFirst({
      where: (wm, { eq }) => eq(wm.userId, userId),
    })

    if (!membership) {
      console.log(`No membership found for user ${userId}, creating new workspace...`)
      const name = session.user.name ?? session.user.email?.split('@')[0] ?? 'My Workspace'
      const wsId = generateId('ws')
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + "-" + wsId.slice(-4)

      await db.insert(schema.workspaces).values({
        id: wsId,
        name,
        slug,
      })

      await db.insert(schema.workspaceMembers).values({
        id: generateId('wm'),
        userId,
        workspaceId: wsId,
        role: 'owner'
      })
      membership = { workspaceId: wsId } as typeof membership
    }

    if (membership) {
      redirect(`/workspace/${membership.workspaceId}/dashboard`)
    }

  } catch (error) {
    if ((error as { digest?: string }).digest?.startsWith('NEXT_REDIRECT')) {
      throw error
    }
    console.log('[Root] Error: ', error)
    redirect('/login')
  }
}

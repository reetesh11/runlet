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
      console.log(`[Root] No workspace for user ${userId} — creating one`)
      const name = session.user.name ?? session.user.email?.split('@')[0] ?? 'Workspace'
      const wsId = generateId('ws')
      const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-') + '-' + wsId.slice(-4)


      await db.insert(schema.workspaces).values({
        id: wsId,
        name: `${name}'s Workspace`,
        slug,
      })
      await db.insert(schema.workspaceMembers).values({
        id: generateId('wm'),
        workspaceId: wsId,
        userId,
        role: 'owner',
      })
      membership = { workspaceId: wsId } as unknown as typeof membership
    }


    redirect(`/workspace/${membership!.workspaceId}/dashboard`)


  } catch (err: unknown) {
    if ((err as { digest?: string }).digest?.startsWith('NEXT_REDIRECT')) throw err
    console.error('[Root] Error:', err)
    redirect('/login')
  }
}






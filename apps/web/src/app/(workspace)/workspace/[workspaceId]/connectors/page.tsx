import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { redirect } from 'next/navigation'
import { createDb, schema } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { ConnectorsClient } from './client'

export default async function ConnectorsPage({ params }: { params: { workspaceId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const { workspaceId } = params
  const db = createDb()

  const connectors = await db.select().from(schema.connectors)
    .where(eq(schema.connectors.workspaceId, workspaceId))

  return <ConnectorsClient initialConnectors={connectors} workspaceId={workspaceId} />
}

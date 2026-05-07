import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { redirect, notFound } from 'next/navigation'
import { createDb, schema } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { generateId } from '@runlet/utils'

export default async function InstallAgentPage({
    params,
    searchParams,
}: {
    params: { workspaceId: string }
    searchParams: { agentId?: string }
}) {
    const session = await getServerSession(authOptions)
    if (!session) redirect('/login')

    const { workspaceId } = params
    const agentId = searchParams.agentId

    if (!agentId) redirect(`/workspace/${workspaceId}/agents`)

    const db = createDb()

    const agent = await db.query.agents.findFirst({
        where: eq(schema.agents.id, agentId),
    })
    if (!agent) notFound()

    // Get latest published version
    const version = await db.query.agentVersions.findFirst({
        where: and(
            eq(schema.agentVersions.agentId, agentId),
            eq(schema.agentVersions.status, 'published')
        ),
    })

    // Check if already installed
    const existing = await db.query.workspaceAgents.findFirst({
        where: and(
            eq(schema.workspaceAgents.workspaceId, workspaceId),
            eq(schema.workspaceAgents.agentId, agentId)
        ),
    })

    if (!existing && version) {
        // Install the agent
        await db.insert(schema.workspaceAgents).values({
            id: generateId('wa'),
            workspaceId,
            agentId,
            pinnedVersionId: version.id,
            installedBy: (session.user as { id: string }).id,
        })

        // Increment install count
        await db.update(schema.agents)
            .set({ installCount: agent.installCount + 1 })
            .where(eq(schema.agents.id, agentId))
    }

    // Redirect to configure page
    if (version) {
        redirect(`/workspace/${workspaceId}/agents/new/configure?agentId=${agentId}&versionId=${version.id}`)
    } else {
        // No published version — go to agents list
        redirect(`/workspace/${workspaceId}/agents`)
    }
}

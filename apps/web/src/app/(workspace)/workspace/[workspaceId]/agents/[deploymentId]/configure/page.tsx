import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import { createDb, schema } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { ConfigureClient } from './client'

export default async function ConfigurePage({
    params,
    searchParams,
}: {
    params: { workspaceId: string; deploymentId: string }
    searchParams: { agentId?: string; versionId?: string }
}) {
    const session = await getServerSession(authOptions)
    if (!session) redirect('/login')

    const { workspaceId, deploymentId } = params
    const db = createDb()

    // Check if this is a new deployment (deploymentId === 'new')
    const isNew = deploymentId === 'new'

    let deployment = null
    let agentVersion = null
    let agent = null

    if (isNew) {
        // New deployment — need agentId + versionId from searchParams
        const agentId = searchParams.agentId
        const versionId = searchParams.versionId

        if (!agentId) redirect(`/workspace/${workspaceId}/agents`)

        agent = await db.query.agents.findFirst({
            where: eq(schema.agents.id, agentId),
        })
        if (!agent) notFound()

        if (versionId) {
            agentVersion = await db.query.agentVersions.findFirst({
                where: and(
                    eq(schema.agentVersions.id, versionId),
                    eq(schema.agentVersions.agentId, agentId)
                ),
            })
        } else {
            // Get latest published version
            agentVersion = await db.query.agentVersions.findFirst({
                where: and(
                    eq(schema.agentVersions.agentId, agentId),
                    eq(schema.agentVersions.status, 'published')
                ),
            })
        }

    } else {
        // Existing deployment
        deployment = await db.query.deployments.findFirst({
            where: and(
                eq(schema.deployments.id, deploymentId),
                eq(schema.deployments.workspaceId, workspaceId)
            ),
        })
        if (!deployment) notFound()

        agent = await db.query.agents.findFirst({
            where: eq(schema.agents.id, deployment.agentId),
        })

        agentVersion = await db.query.agentVersions.findFirst({
            where: eq(schema.agentVersions.id, deployment.agentVersionId),
        })
    }

    if (!agentVersion || !agent) notFound()

    // Get workspace connectors
    const connectors = await db.select().from(schema.connectors)
        .where(eq(schema.connectors.workspaceId, workspaceId))

    return (
        <ConfigureClient
            workspaceId={workspaceId}
            agent={agent}
            agentVersion={agentVersion}
            deployment={deployment}
            connectors={connectors}
            isNew={isNew}
        />
    )
}

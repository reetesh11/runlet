import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import { createDb, schema } from '@/lib/db'
import { eq, and, desc } from 'drizzle-orm'
import { RunsClient } from './client'

export default async function RunsPage({
    params,
    searchParams,
}: {
    params: { workspaceId: string; deploymentId: string }
    searchParams: { runId?: string }
}) {
    const session = await getServerSession(authOptions)
    if (!session) redirect('/login')

    const { workspaceId, deploymentId } = params
    const db = createDb()

    const deployment = await db.query.deployments.findFirst({
        where: and(
            eq(schema.deployments.id, deploymentId),
            eq(schema.deployments.workspaceId, workspaceId)
        ),
    })
    if (!deployment) notFound()

    const agent = await db.query.agents.findFirst({
        where: eq(schema.agents.id, deployment.agentId),
    })

    // Get runs for this deployment
    const runs = await db.select().from(schema.runs)
        .where(and(
            eq(schema.runs.deploymentId, deploymentId),
            eq(schema.runs.workspaceId, workspaceId)
        ))
        .orderBy(desc(schema.runs.createdAt))
        .limit(50)

    // If a specific run is selected, get its audit events
    let selectedRunEvents: typeof schema.auditEvents.$inferSelect[] = []
    const selectedRunId = searchParams.runId ?? runs[0]?.id

    if (selectedRunId) {
        selectedRunEvents = await db.select().from(schema.auditEvents)
            .where(eq(schema.auditEvents.runId, selectedRunId))
            .orderBy(schema.auditEvents.occurredAt)
    }

    const selectedRun = runs.find(r => r.id === selectedRunId) ?? runs[0] ?? null

    return (
        <RunsClient
            workspaceId={workspaceId}
            deployment={deployment}
            agent={agent ?? null}
            runs={runs}
            selectedRun={selectedRun}
            selectedRunEvents={selectedRunEvents}
        />
    )
}

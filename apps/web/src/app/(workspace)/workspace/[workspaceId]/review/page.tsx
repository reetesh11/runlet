import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { eq, and } from 'drizzle-orm'
import { createDb, schema } from '@/lib/db'
import { Empty, PageHeader } from '@/components/ui'
import { CheckCircle } from 'lucide-react'
import { ReviewClient } from './client'

export default async function ReviewPage({ params }: { params: { workspaceId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const { workspaceId } = params
  const db = createDb()

  const pendingRows = await db
    .select({
      run: schema.runs,
      deployment: schema.deployments,
      agent: schema.agents,
    })
    .from(schema.runs)
    .innerJoin(schema.deployments, eq(schema.runs.deploymentId, schema.deployments.id))
    .innerJoin(schema.agents, eq(schema.deployments.agentId, schema.agents.id))
    .where(
      and(
        eq(schema.runs.workspaceId, workspaceId),
        eq(schema.runs.status, 'pending_review')
      )
    )
    .orderBy(schema.runs.createdAt)

  const pendingRuns = pendingRows.map(row => ({
    id: row.run.id,
    deploymentId: row.run.deploymentId,
    confidenceScore: row.run.confidenceScore,
    createdAt: row.run.createdAt,
    agentName: row.agent.displayName,
    deploymentName: row.deployment.instanceName,
  }))

  return (
    <div className="p-6">
      <PageHeader
        title="Human Review Queue"
        description={
          pendingRuns.length > 0
            ? `${pendingRuns.length} run${pendingRuns.length !== 1 ? 's' : ''} awaiting review`
            : 'All caught up'
        }
      />

      {pendingRuns.length === 0 ? (
        <Empty
          icon={<CheckCircle className="w-10 h-10" />}
          title="No pending reviews"
          description="Runs that require human review will appear here. All looks good right now."
        />
      ) : (
        <ReviewClient pendingRuns={pendingRuns} workspaceId={workspaceId} />
      )}
    </div>
  )
}

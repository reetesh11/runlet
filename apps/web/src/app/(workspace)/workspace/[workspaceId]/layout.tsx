import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { WorkspaceLayout } from '@/components/layout/sidebar'

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { workspaceId: string }
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')

  return (
    <WorkspaceLayout workspaceId={params.workspaceId}>
      {children}
    </WorkspaceLayout>
  )
}

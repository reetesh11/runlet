import { createHash } from 'crypto'
import Link from 'next/link'
import { Play } from 'lucide-react'
import { createDb } from '@/lib/db'
import { AcceptInviteForm } from './accept-invite-form'

function InvalidInvite({ message }: { message: string }) {
    return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
            <div className="relative w-full max-w-sm text-center">
                <div className="flex items-center justify-center gap-2 mb-8">
                    <div className="w-8 h-8 bg-brand-500 rounded-xl flex items-center justify-center">
                        <Play className="w-4 h-4 text-white fill-white" />
                    </div>
                    <span className="text-xl font-bold text-white">run<span className="text-brand-400">let</span></span>
                </div>
                <div className="bg-white/3 border border-white/7 rounded-2xl p-8">
                    <div className="w-12 h-12 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="text-red-400 text-xl">✕</span>
                    </div>
                    <h1 className="text-lg font-bold text-white mb-2">Invalid invitation</h1>
                    <p className="text-sm text-gray-500 mb-6">{message}</p>
                    <Link
                        href="/signup"
                        className="inline-flex items-center justify-center px-4 py-2 bg-brand-500 hover:bg-brand-400 text-white text-sm font-medium rounded-xl transition-colors"
                    >
                        Request a new invitation
                    </Link>
                </div>
            </div>
        </div>
    )
}

export default async function AcceptInvitePage({
    searchParams,
}: {
    searchParams: { token?: string }
}) {
    const token = searchParams.token

    if (!token) {
        return (
            <InvalidInvite message="No invitation token found. Please use the link from your email or request a new invitation." />
        )
    }

    const tokenHash = createHash('sha256').update(token).digest('hex')
    const db = createDb()

    const invite = await db.query.verificationTokens.findFirst({
        where: (vt, { and, eq, gt }) =>
            and(eq(vt.token, tokenHash), gt(vt.expires, new Date())),
    })

    if (!invite) {
        return (
            <InvalidInvite message="This invitation link is invalid or has expired. Please request a new one." />
        )
    }

    return <AcceptInviteForm token={token} email={invite.identifier} />
}

'use client'
import { useState } from 'react'
import { Play, Loader2, Mail, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'

export function SignupForm() {
    const [email, setEmail] = useState('')
    const [loading, setLoading] = useState(false)
    const [sent, setSent] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError(null)
        setLoading(true)

        const res = await fetch('/api/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
        })

        const data = await res.json() as { error?: string; success?: boolean }
        setLoading(false)

        if (!res.ok) {
            setError(data.error ?? 'Something went wrong. Please try again.')
            return
        }

        setSent(true)
    }

    if (sent) {
        return (
            <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-brand-500/5 rounded-full blur-3xl" />
                </div>
                <div className="relative w-full max-w-sm text-center">
                    <div className="flex items-center justify-center gap-2 mb-8">
                        <div className="w-8 h-8 bg-brand-500 rounded-xl flex items-center justify-center">
                            <Play className="w-4 h-4 text-white fill-white" />
                        </div>
                        <span className="text-xl font-bold text-white">run<span className="text-brand-400">let</span></span>
                    </div>
                    <div className="bg-white/3 border border-white/7 rounded-2xl p-8">
                        <div className="w-12 h-12 bg-green-500/10 border border-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <CheckCircle2 className="w-6 h-6 text-green-400" />
                        </div>
                        <h1 className="text-lg font-bold text-white mb-2">Check your inbox</h1>
                        <p className="text-sm text-gray-500 mb-1">
                            We sent an invitation link to
                        </p>
                        <p className="text-sm font-medium text-gray-300 mb-4">{email}</p>
                        <p className="text-xs text-gray-600">
                            The link expires in 24 hours. Check your spam folder if you don't see it.
                        </p>
                    </div>
                    <p className="text-center text-xs text-gray-700 mt-4">
                        Already have an account?{' '}
                        <Link href="/login" className="text-brand-400 hover:text-brand-300">Sign in</Link>
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-brand-500/5 rounded-full blur-3xl" />
            </div>

            <div className="relative w-full max-w-sm">
                <div className="flex items-center justify-center gap-2 mb-8">
                    <div className="w-8 h-8 bg-brand-500 rounded-xl flex items-center justify-center">
                        <Play className="w-4 h-4 text-white fill-white" />
                    </div>
                    <span className="text-xl font-bold text-white">run<span className="text-brand-400">let</span></span>
                </div>

                <div className="bg-white/3 border border-white/7 rounded-2xl p-6">
                    <h1 className="text-lg font-bold text-white text-center mb-1">Create your account</h1>
                    <p className="text-sm text-gray-600 text-center mb-6">
                        Enter your email and we'll send you an invitation link
                    </p>

                    <form onSubmit={handleSubmit} className="space-y-3">
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 pointer-events-none" />
                            <input
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                placeholder="you@company.com"
                                required
                                autoFocus
                                className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand-500/50"
                            />
                        </div>

                        {error && (
                            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                                {error}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={loading || !email}
                            className="w-full flex items-center justify-center gap-2 py-2.5 bg-brand-500 hover:bg-brand-400 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                            {loading ? 'Sending...' : 'Send invitation link'}
                        </button>
                    </form>
                </div>

                <p className="text-center text-xs text-gray-700 mt-4">
                    Already have an account?{' '}
                    <Link href="/login" className="text-brand-400 hover:text-brand-300">Sign in</Link>
                </p>
            </div>
        </div>
    )
}

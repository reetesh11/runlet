'use client'
import { signIn, useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Github, Play, Loader2, Eye, EyeOff } from 'lucide-react'
import Link from 'next/link'

export function LoginForm() {
    const { data: session, status } = useSession()
    const router = useRouter()
    const searchParams = useSearchParams()

    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [loading, setLoading] = useState(false)
    const [redirecting, setRedirecting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const invited = searchParams.get('invited') === '1'
    const urlError = searchParams.get('error')

    useEffect(() => {
        if (session && !redirecting) {
            setRedirecting(true)
            router.push('/')
        }
    }, [session, redirecting, router])

    async function handleEmailLogin(e: React.FormEvent) {
        e.preventDefault()
        setError(null)
        setLoading(true)

        const result = await signIn('credentials', {
            email,
            password,
            redirect: false,
        })

        setLoading(false)

        if (result?.ok) {
            setRedirecting(true)
            router.push('/')
            return
        }

        // Map NextAuth error codes to user-friendly messages
        if (result?.error) {
            setError('Invalid email or password.')
        }
    }

    async function handleGithub() {
        await signIn('github', { callbackUrl: '/' })
    }

    if (status === 'loading' || redirecting) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-950">
                <div className="flex items-center gap-3 text-gray-500">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm">{redirecting ? 'Redirecting...' : 'Loading...'}</span>
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
                    <span className="text-xl font-bold text-white">
                        run<span className="text-brand-400">let</span>
                    </span>
                </div>

                <div className="bg-white/3 border border-white/7 rounded-2xl p-6">
                    <h1 className="text-lg font-bold text-white text-center mb-1">Welcome back</h1>
                    <p className="text-sm text-gray-600 text-center mb-6">Sign in to your workspace</p>

                    {/* Success banner after invite acceptance */}
                    {invited && (
                        <div className="mb-4 text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2 text-center">
                            Account created! Please sign in with your new password.
                        </div>
                    )}

                    {/* OAuth error banner */}
                    {urlError && !invited && (
                        <div className="mb-4 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-center">
                            Sign-in failed. Please try again.
                        </div>
                    )}

                    {/* GitHub */}
                    <button
                        onClick={handleGithub}
                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm text-gray-200 transition-colors mb-4"
                    >
                        <Github className="w-4 h-4" /> Continue with GitHub
                    </button>

                    <div className="relative my-4">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-white/7" />
                        </div>
                        <div className="relative flex justify-center">
                            <span className="px-2 bg-gray-950 text-xs text-gray-600">or</span>
                        </div>
                    </div>

                    {/* Email + password */}
                    <form onSubmit={handleEmailLogin} className="space-y-2">
                        <input
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder="Email address"
                            required
                            autoComplete="email"
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand-500/50"
                        />

                        <div className="relative">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="Password"
                                required
                                autoComplete="current-password"
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 pr-10 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand-500/50"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(v => !v)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400"
                            >
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>

                        {error && (
                            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                                {error}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex items-center justify-center gap-2 py-2.5 bg-brand-500 hover:bg-brand-400 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                            {loading ? 'Signing in...' : 'Sign in'}
                        </button>
                    </form>
                </div>

                <p className="text-center text-xs text-gray-700 mt-4">
                    Don't have an account?{' '}
                    <Link href="/signup" className="text-brand-400 hover:text-brand-300">
                        Sign up
                    </Link>
                </p>
            </div>
        </div>
    )
}

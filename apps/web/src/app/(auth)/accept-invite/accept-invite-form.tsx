'use client'
import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Play, Loader2, Eye, EyeOff, CheckCircle2, Circle } from 'lucide-react'

const REQUIREMENTS = [
    { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
    { label: 'One uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
    { label: 'One lowercase letter', test: (p: string) => /[a-z]/.test(p) },
    { label: 'One number', test: (p: string) => /[0-9]/.test(p) },
]

interface Props {
    token: string
    email: string
}

export function AcceptInviteForm({ token, email }: Props) {
    const router = useRouter()
    const [password, setPassword] = useState('')
    const [confirm, setConfirm] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [showConfirm, setShowConfirm] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const allRequirementsMet = REQUIREMENTS.every(r => r.test(password))
    const passwordsMatch = password === confirm && confirm.length > 0
    const canSubmit = allRequirementsMet && passwordsMatch && !loading

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!canSubmit) return
        setError(null)
        setLoading(true)

        // Step 1: Create the account
        const res = await fetch('/api/auth/accept-invite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, password }),
        })

        const data = await res.json() as { error?: string; success?: boolean }

        if (!res.ok) {
            setError(data.error ?? 'Something went wrong. Please try again.')
            setLoading(false)
            return
        }

        // Step 2: Sign in automatically
        const result = await signIn('credentials', {
            email,
            password,
            redirect: false,
        })

        if (result?.ok) {
            router.push('/')
        } else {
            // Account created but auto sign-in failed — send to login
            router.push('/login?invited=1')
        }
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
                    <h1 className="text-lg font-bold text-white text-center mb-1">Set your password</h1>
                    <p className="text-sm text-gray-600 text-center mb-1">
                        You&apos;re joining as
                    </p>
                    <p className="text-sm font-medium text-gray-300 text-center mb-6">{email}</p>

                    <form onSubmit={handleSubmit} className="space-y-3">
                        {/* Password */}
                        <div className="relative">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="Password"
                                autoFocus
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

                        {/* Password requirements */}
                        {password.length > 0 && (
                            <ul className="space-y-1 px-1">
                                {REQUIREMENTS.map(r => {
                                    const met = r.test(password)
                                    return (
                                        <li key={r.label} className="flex items-center gap-2">
                                            {met
                                                ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                                                : <Circle className="w-3.5 h-3.5 text-gray-700 shrink-0" />
                                            }
                                            <span className={`text-xs ${met ? 'text-green-400' : 'text-gray-600'}`}>
                                                {r.label}
                                            </span>
                                        </li>
                                    )
                                })}
                            </ul>
                        )}

                        {/* Confirm password */}
                        <div className="relative">
                            <input
                                type={showConfirm ? 'text' : 'password'}
                                value={confirm}
                                onChange={e => setConfirm(e.target.value)}
                                placeholder="Confirm password"
                                className={`w-full bg-white/5 border rounded-xl px-3 py-2.5 pr-10 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand-500/50 ${
                                    confirm.length > 0 && !passwordsMatch
                                        ? 'border-red-500/50'
                                        : 'border-white/10'
                                }`}
                            />
                            <button
                                type="button"
                                onClick={() => setShowConfirm(v => !v)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400"
                            >
                                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                        {confirm.length > 0 && !passwordsMatch && (
                            <p className="text-xs text-red-400 px-1">Passwords do not match.</p>
                        )}

                        {error && (
                            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                                {error}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={!canSubmit}
                            className="w-full flex items-center justify-center gap-2 py-2.5 bg-brand-500 hover:bg-brand-400 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                            {loading ? 'Creating account...' : 'Set password & join'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    )
}

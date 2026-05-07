'use client'
import { signIn, useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui'
import { Github, Play, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('admin@runlet.ai')
  const [loading, setLoading] = useState(false)

  const callbackUrl = searchParams.get('callbackUrl') ?? '/'

  useEffect(() => {
    if (session) router.push('/')
  }, [session, router])

  async function handleDevLogin() {
    setLoading(true)
    await signIn('credentials', { email, callbackUrl })
    setLoading(false)
  }

  async function handleGithub() {
    await signIn('github', { callbackUrl })
  }

  if (status === 'loading') {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-600" /></div>
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-brand-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-8 h-8 bg-brand-500 rounded-xl flex items-center justify-center">
            <Play className="w-4 h-4 text-white fill-white" />
          </div>
          <span className="text-xl font-bold text-white">run<span className="text-brand-400">let</span></span>
        </div>

        <div className="bg-white/3 border border-white/7 rounded-2xl p-6">
          <h1 className="text-lg font-bold text-white text-center mb-1">Welcome back</h1>
          <p className="text-sm text-gray-600 text-center mb-6">Sign in to your workspace</p>

          {/* GitHub */}
          <button onClick={handleGithub}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm text-gray-200 transition-colors mb-3">
            <Github className="w-4 h-4" /> Continue with GitHub
          </button>

          {/* Dev login */}
          {process.env.NODE_ENV !== 'production' && (
            <>
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/7" /></div>
                <div className="relative flex justify-center"><span className="px-2 bg-gray-950 text-xs text-gray-600">Dev only</span></div>
              </div>
              <div className="space-y-2">
                <input
                  type="email"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand-500/50"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="dev@example.com"
                />
                <Button className="w-full justify-center" onClick={handleDevLogin} loading={loading}>
                  Dev Login (no password)
                </Button>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-xs text-gray-700 mt-4">
          Runlet — AI Agent Marketplace
        </p>
      </div>
    </div>
  )
}

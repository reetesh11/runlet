'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Input, Select } from '@/components/ui'
import { UserPlus, X, Check } from 'lucide-react'

const ROLE_OPTIONS = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'operator', label: 'Operator' },
  { value: 'developer', label: 'Developer' },
  { value: 'admin', label: 'Admin' },
]

export function InviteMemberForm({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('developer')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleClose() {
    setOpen(false)
    setEmail('')
    setRole('developer')
    setError(null)
    setSuccess(false)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) {
      setError('Email is required')
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/v1/workspaces/${workspaceId}/members/invite`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Workspace-Id': workspaceId,
          },
          body: JSON.stringify({ email: email.trim(), role }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: string }
          throw new Error(body.error ?? `Request failed with status ${res.status}`)
        }
        setSuccess(true)
        setTimeout(() => {
          handleClose()
          router.refresh()
        }, 1500)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-2 bg-brand-500 hover:bg-brand-400 text-white text-sm font-medium rounded-xl transition-colors"
      >
        <UserPlus className="w-3.5 h-3.5" />
        Invite Member
      </button>
    )
  }

  return (
    <div className="bg-white/3 border border-brand-500/20 rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-200">Invite a team member</h3>
        <button
          onClick={handleClose}
          className="p-1 text-gray-600 hover:text-gray-300 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {success ? (
        <div className="flex items-center gap-2 py-2 text-emerald-400">
          <Check className="w-4 h-4" />
          <p className="text-sm">Invitation sent successfully!</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            label="Email address"
            type="email"
            placeholder="colleague@company.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            error={error ?? undefined}
            autoFocus
          />
          <Select
            label="Role"
            options={ROLE_OPTIONS}
            value={role}
            onChange={e => setRole(e.target.value)}
          />
          <div className="flex items-center gap-2 pt-1">
            <Button type="submit" size="sm" loading={isPending}>
              Send Invite
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={handleClose}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

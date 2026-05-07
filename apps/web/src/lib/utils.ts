import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ── API client ─────────────────────────────────────────────────
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export async function apiClient<T>(
  path: string,
  options?: RequestInit & { workspaceId?: string }
): Promise<T> {
  const { workspaceId, ...fetchOptions } = options ?? {}
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string> ?? {}),
  }
  if (workspaceId) headers['X-Workspace-Id'] = workspaceId

  const resp = await fetch(`${API_BASE}${path}`, { ...fetchOptions, headers })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Request failed' })) as { error?: string }
    throw new Error(err.error ?? `HTTP ${resp.status}`)
  }
  return resp.json() as Promise<T>
}

// ── Formatting helpers ─────────────────────────────────────────
export function formatDuration(ms?: number | null): string {
  if (!ms) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function formatDate(date?: Date | string | null): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(date))
}

export function formatRelative(date?: Date | string | null): string {
  if (!date) return '—'
  const d = new Date(date)
  const diff = Date.now() - d.getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

export function formatTokens(n?: number | null): string {
  if (!n) return '—'
  if (n < 1000) return String(n)
  return `${(n / 1000).toFixed(1)}k`
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    success: 'text-emerald-400',
    active: 'text-emerald-400',
    healthy: 'text-emerald-400',
    failed: 'text-red-400',
    error: 'text-red-400',
    guardrail_blocked: 'text-orange-400',
    pending_review: 'text-amber-400',
    paused: 'text-amber-400',
    queued: 'text-blue-400',
    running: 'text-blue-400',
    draft: 'text-gray-400',
    saved_draft: 'text-gray-400',
  }
  return map[status] ?? 'text-gray-400'
}

export function statusBg(status: string): string {
  const map: Record<string, string> = {
    success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    failed: 'bg-red-500/10 text-red-400 border-red-500/20',
    error: 'bg-red-500/10 text-red-400 border-red-500/20',
    guardrail_blocked: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    pending_review: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    paused: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    queued: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    running: 'bg-blue-500/10 text-blue-400 border-blue-500/20 animate-pulse',
    draft: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
    saved_draft: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
    published: 'bg-brand/10 text-brand-300 border-brand-500/20',
  }
  return map[status] ?? 'bg-gray-500/10 text-gray-400 border-gray-500/20'
}

export const VERTICALS = [
  'customer_support', 'engineering', 'finance', 'hr', 'sales',
  'marketing', 'legal', 'it_security', 'data_analytics', 'operations',
  'healthcare', 'real_estate', 'education', 'supply_chain',
]

export const VERTICAL_LABELS: Record<string, string> = {
  customer_support: 'Customer Support',
  engineering: 'Engineering',
  finance: 'Finance',
  hr: 'HR',
  sales: 'Sales',
  marketing: 'Marketing',
  legal: 'Legal',
  it_security: 'IT & Security',
  data_analytics: 'Data Analytics',
  operations: 'Operations',
  healthcare: 'Healthcare',
  real_estate: 'Real Estate',
  education: 'Education',
  supply_chain: 'Supply Chain',
}

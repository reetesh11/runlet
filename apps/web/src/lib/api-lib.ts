// All API calls go through /api/v1/ — the Next.js proxy
// The proxy adds auth server-side and forwards to the Hono API
// No need to pass tokens from the client

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

    // All requests go to /api/v1/ — no Authorization header needed
    const resp = await fetch(`/api/v1/${path}`, { ...fetchOptions, headers })

    if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Request failed' })) as { error?: string }
        throw new Error(err.error ?? `HTTP ${resp.status}`)
    }

    return resp.json() as Promise<T>
}

export function formatDuration(ms?: number | null): string {
    if (!ms) return '—'
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
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

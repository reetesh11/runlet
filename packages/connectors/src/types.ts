// ── Connector types ─────────────────────────────────────────────
export interface ConnectorCredentials {
  accessToken?: string
  apiKey?: string
  subdomain?: string
  workspaceId?: string
  baseUrl?: string
  [key: string]: unknown
}

export interface ConnectorActionResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
  statusCode?: number
  latencyMs?: number
}

export type ConnectorAction<TInput = unknown, TOutput = unknown> = (
  credentials: ConnectorCredentials,
  input: TInput
) => Promise<ConnectorActionResult<TOutput>>

export interface ConnectorDefinition {
  provider: string
  displayName: string
  description: string
  authMethods: string[]
  requiredScopes: string[]
  actions: Record<string, ConnectorAction<any, any>>
  oauthConfig?: {
    authorizationUrl: string
    tokenUrl: string
    scopes: string[]
  }
}

// ── HTTP helper ─────────────────────────────────────────────────
export async function httpRequest<T>(
  url: string,
  options: RequestInit & { accessToken?: string; apiKey?: string }
): Promise<{ data: T; status: number; latencyMs: number }> {
  const start = Date.now()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> ?? {}),
  }
  if (options.accessToken) headers['Authorization'] = `Bearer ${options.accessToken}`
  if (options.apiKey) headers['Authorization'] = `Token ${options.apiKey}`

  const resp = await fetch(url, { ...options, headers })
  const latencyMs = Date.now() - start

  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw Object.assign(new Error(`HTTP ${resp.status}: ${text}`), { status: resp.status })
  }

  const contentType = resp.headers.get('content-type') ?? ''
  const data = contentType.includes('application/json')
    ? (await resp.json() as T)
    : (await resp.text() as unknown as T)

  return { data, status: resp.status, latencyMs }
}

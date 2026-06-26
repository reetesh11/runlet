import { ConnectorDefinition, ConnectorCredentials, ConnectorActionResult, httpRequest } from '../types'

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'

async function getFreshAccessToken(creds: ConnectorCredentials): Promise<string> {
  const token = creds.accessToken as string | undefined
  const expiry = creds.tokenExpiry as string | undefined
  const refreshToken = creds.refreshToken as string | undefined
  const clientId = creds.clientId as string | undefined
  const clientSecret = creds.clientSecret as string | undefined

  // If token is still valid (>5 min buffer), use it
  if (token && expiry && new Date(expiry).getTime() - Date.now() > 5 * 60 * 1000) {
    return token
  }

  // Refresh using refresh token
  if (!refreshToken || !clientId || !clientSecret) {
    if (token) return token // best effort with expired token
    throw new Error('Gmail: no access token or refresh credentials available')
  }

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Gmail token refresh failed: ${text}`)
  }

  const data = await resp.json() as { access_token: string; expires_in: number }
  return data.access_token
}

interface GmailMessage {
  id: string
  threadId: string
  subject: string
  from: string
  to: string
  date: string
  snippet: string
  body: string
  isUnread: boolean
}

function decodeBase64Url(data: string): string {
  try {
    return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
  } catch {
    return ''
  }
}

function extractHeader(headers: Array<{ name: string; value: string }>, name: string): string {
  return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
}

function extractBody(payload: Record<string, unknown>): string {
  // Simple message: body data directly on payload
  const body = payload.body as { data?: string; size?: number } | undefined
  if (body?.data) return decodeBase64Url(body.data)

  // Multipart: walk parts to find text/plain, then text/html as fallback
  const parts = (payload.parts ?? []) as Array<Record<string, unknown>>

  const findText = (parts: Array<Record<string, unknown>>, mimeType: string): string => {
    for (const part of parts) {
      if (part.mimeType === mimeType) {
        const b = part.body as { data?: string } | undefined
        if (b?.data) return decodeBase64Url(b.data)
      }
      // Recurse into nested multipart
      if (String(part.mimeType ?? '').startsWith('multipart/')) {
        const nested = findText((part.parts ?? []) as Array<Record<string, unknown>>, mimeType)
        if (nested) return nested
      }
    }
    return ''
  }

  return findText(parts, 'text/plain') || findText(parts, 'text/html')
}

// ── Actions ──────────────────────────────────────────────────────

async function listUnreadMessages(
  creds: ConnectorCredentials,
  input: { days?: number; maxResults?: number }
): Promise<ConnectorActionResult<Array<{ id: string; threadId: string }>>> {
  try {
    const accessToken = await getFreshAccessToken(creds)
    const days = input.days ?? 7
    const maxResults = Math.min(input.maxResults ?? 20, 50)
    const q = `is:unread newer_than:${days}d`
    const params = new URLSearchParams({ q, maxResults: String(maxResults) })

    const { data, latencyMs } = await httpRequest<{
      messages?: Array<{ id: string; threadId: string }>
      resultSizeEstimate?: number
    }>(`${BASE}/messages?${params}`, {
      method: 'GET',
      accessToken,
    })

    return { success: true, data: data.messages ?? [], latencyMs }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

async function getMessage(
  creds: ConnectorCredentials,
  input: { messageId: string }
): Promise<ConnectorActionResult<GmailMessage>> {
  try {
    const accessToken = await getFreshAccessToken(creds)
    const { data, latencyMs } = await httpRequest<{
      id: string
      threadId: string
      snippet: string
      labelIds: string[]
      payload: {
        headers: Array<{ name: string; value: string }>
        body: { data?: string; size?: number }
        parts?: Array<Record<string, unknown>>
        mimeType: string
      }
    }>(`${BASE}/messages/${input.messageId}?format=full`, {
      method: 'GET',
      accessToken,
    })

    const headers = data.payload.headers
    const body = extractBody(data.payload as unknown as Record<string, unknown>)

    const message: GmailMessage = {
      id: data.id,
      threadId: data.threadId,
      subject: extractHeader(headers, 'Subject') || '(no subject)',
      from: extractHeader(headers, 'From'),
      to: extractHeader(headers, 'To'),
      date: extractHeader(headers, 'Date'),
      snippet: data.snippet,
      // Trim body to 2000 chars to keep LLM context manageable
      body: body.slice(0, 2000) || data.snippet,
      isUnread: data.labelIds?.includes('UNREAD') ?? true,
    }

    return { success: true, data: message, latencyMs }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

async function markAsRead(
  creds: ConnectorCredentials,
  input: { messageId: string }
): Promise<ConnectorActionResult> {
  try {
    const accessToken = await getFreshAccessToken(creds)
    const { data, latencyMs } = await httpRequest<{ id: string }>(
      `${BASE}/messages/${input.messageId}/modify`,
      {
        method: 'POST',
        accessToken,
        body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
      }
    )
    return { success: true, data, latencyMs }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

async function getUserProfile(
  creds: ConnectorCredentials,
  _input: Record<string, unknown>
): Promise<ConnectorActionResult<{ emailAddress: string; messagesTotal: number }>> {
  try {
    const accessToken = await getFreshAccessToken(creds)
    const { data, latencyMs } = await httpRequest<{
      emailAddress: string
      messagesTotal: number
      threadsTotal: number
    }>(`${BASE}/profile`, {
      method: 'GET',
      accessToken,
    })
    return { success: true, data, latencyMs }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

// ── Connector definition ──────────────────────────────────────────
export const gmailConnector: ConnectorDefinition = {
  provider: 'gmail',
  displayName: 'Gmail',
  description: 'Read and manage Gmail messages via Google OAuth',
  authMethods: ['oauth2_pkce'],
  requiredScopes: ['https://www.googleapis.com/auth/gmail.readonly'],
  oauthConfig: {
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
  },
  actions: {
    'messages.list': listUnreadMessages,
    'messages.get': getMessage,
    'messages.markRead': markAsRead,
    'profile.get': getUserProfile,
  },
}

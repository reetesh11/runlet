import { ConnectorDefinition, ConnectorCredentials, ConnectorActionResult, httpRequest } from '../types'

function base(creds: ConnectorCredentials): string {
  const sub = creds.subdomain as string
  if (!sub) throw new Error('Zendesk connector requires subdomain in credentials')
  return `https://${sub}.zendesk.com/api/v2`
}

// ── Action: list tickets ────────────────────────────────────────
async function listTickets(
  creds: ConnectorCredentials,
  input: { status?: string; assigneeId?: string; limit?: number }
): Promise<ConnectorActionResult> {
  try {
    const params = new URLSearchParams()
    if (input.status) params.set('status', input.status)
    if (input.assigneeId) params.set('assignee_id', input.assigneeId)
    if (input.limit) params.set('per_page', String(input.limit))
    const { data, latencyMs } = await httpRequest<{ tickets: unknown[] }>(
      `${base(creds)}/tickets.json?${params}`,
      { method: 'GET', accessToken: creds.accessToken }
    )
    return { success: true, data: data.tickets, latencyMs }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

// ── Action: get ticket ──────────────────────────────────────────
async function getTicket(
  creds: ConnectorCredentials,
  input: { ticketId: string | number }
): Promise<ConnectorActionResult> {
  try {
    const { data, latencyMs } = await httpRequest<{ ticket: unknown }>(
      `${base(creds)}/tickets/${input.ticketId}.json`,
      { method: 'GET', accessToken: creds.accessToken }
    )
    return { success: true, data: data.ticket, latencyMs }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

// ── Action: create ticket ───────────────────────────────────────
async function createTicket(
  creds: ConnectorCredentials,
  input: { subject: string; body: string; priority?: string; tags?: string[] }
): Promise<ConnectorActionResult> {
  try {
    const { data, latencyMs } = await httpRequest<{ ticket: unknown }>(
      `${base(creds)}/tickets.json`,
      {
        method: 'POST',
        accessToken: creds.accessToken,
        body: JSON.stringify({
          ticket: {
            subject: input.subject,
            comment: { body: input.body },
            priority: input.priority ?? 'normal',
            tags: input.tags ?? [],
          },
        }),
      }
    )
    return { success: true, data: data.ticket, latencyMs }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

// ── Action: update ticket ───────────────────────────────────────
async function updateTicket(
  creds: ConnectorCredentials,
  input: {
    ticketId: string | number
    status?: string
    priority?: string
    tags?: string[]
    comment?: string
    assigneeId?: number
  }
): Promise<ConnectorActionResult> {
  try {
    const patch: Record<string, unknown> = {}
    if (input.status) patch.status = input.status
    if (input.priority) patch.priority = input.priority
    if (input.tags) patch.tags = input.tags
    if (input.assigneeId) patch.assignee_id = input.assigneeId
    if (input.comment) patch.comment = { body: input.comment, public: true }

    const { data, latencyMs } = await httpRequest<{ ticket: unknown }>(
      `${base(creds)}/tickets/${input.ticketId}.json`,
      { method: 'PUT', accessToken: creds.accessToken, body: JSON.stringify({ ticket: patch }) }
    )
    return { success: true, data: data.ticket, latencyMs }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

// ── Action: search tickets ──────────────────────────────────────
async function searchTickets(
  creds: ConnectorCredentials,
  input: { query: string; limit?: number }
): Promise<ConnectorActionResult> {
  try {
    const params = new URLSearchParams({
      query: `type:ticket ${input.query}`,
      per_page: String(input.limit ?? 25),
    })
    const { data, latencyMs } = await httpRequest<{ results: unknown[] }>(
      `${base(creds)}/search.json?${params}`,
      { method: 'GET', accessToken: creds.accessToken }
    )
    return { success: true, data: data.results, latencyMs }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

// ── Action: post comment ────────────────────────────────────────
async function postComment(
  creds: ConnectorCredentials,
  input: { ticketId: string | number; body: string; isPublic?: boolean }
): Promise<ConnectorActionResult> {
  try {
    const { data, latencyMs } = await httpRequest<{ ticket: unknown }>(
      `${base(creds)}/tickets/${input.ticketId}.json`,
      {
        method: 'PUT',
        accessToken: creds.accessToken,
        body: JSON.stringify({
          ticket: {
            comment: { body: input.body, public: input.isPublic ?? true },
          },
        }),
      }
    )
    return { success: true, data: data.ticket, latencyMs }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

// ── Action: get ticket comments ──────────────────────────────────
async function getTicketComments(
  creds: ConnectorCredentials,
  input: { ticketId: string | number }
): Promise<ConnectorActionResult> {
  try {
    const { data, latencyMs } = await httpRequest<{ comments: unknown[] }>(
      `${base(creds)}/tickets/${input.ticketId}/comments.json`,
      { method: 'GET', accessToken: creds.accessToken }
    )
    return { success: true, data: data.comments, latencyMs }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

// ── Definition ──────────────────────────────────────────────────
export const zendeskConnector: ConnectorDefinition = {
  provider: 'zendesk',
  displayName: 'Zendesk',
  description: 'Customer support ticketing platform',
  authMethods: ['oauth2_pkce', 'api_key'],
  requiredScopes: ['tickets:read', 'tickets:write'],
  oauthConfig: {
    authorizationUrl: 'https://{subdomain}.zendesk.com/oauth/authorizations/new',
    tokenUrl: 'https://{subdomain}.zendesk.com/oauth/tokens',
    scopes: ['read', 'write'],
  },
  actions: {
    'tickets.list': listTickets,
    'tickets.get': getTicket,
    'tickets.create': createTicket,
    'tickets.update': updateTicket,
    'tickets.search': searchTickets,
    'tickets.comment': postComment,
    'tickets.comments': getTicketComments,
  },
}

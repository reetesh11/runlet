import { ConnectorDefinition, ConnectorCredentials, ConnectorActionResult, httpRequest } from '../types'

const BASE = 'https://slack.com/api'

async function postMessage(
  creds: ConnectorCredentials,
  input: { channel: string; text?: string; blocks?: unknown[]; threadTs?: string }
): Promise<ConnectorActionResult> {
  try {
    const { data, latencyMs } = await httpRequest<{ ok: boolean; ts: string; channel: string }>(
      `${BASE}/chat.postMessage`,
      {
        method: 'POST',
        accessToken: creds.accessToken,
        body: JSON.stringify({
          channel: input.channel,
          text: input.text,
          blocks: input.blocks,
          thread_ts: input.threadTs,
        }),
      }
    )
    return { success: data.ok, data, latencyMs }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

async function listChannels(
  creds: ConnectorCredentials,
  input: { limit?: number }
): Promise<ConnectorActionResult> {
  try {
    const params = new URLSearchParams({ limit: String(input.limit ?? 100), types: 'public_channel,private_channel' })
    const { data, latencyMs } = await httpRequest<{ ok: boolean; channels: unknown[] }>(
      `${BASE}/conversations.list?${params}`,
      { method: 'GET', accessToken: creds.accessToken }
    )
    return { success: data.ok, data: data.channels, latencyMs }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

async function getChannelHistory(
  creds: ConnectorCredentials,
  input: { channel: string; limit?: number; oldest?: string }
): Promise<ConnectorActionResult> {
  try {
    const params = new URLSearchParams({
      channel: input.channel,
      limit: String(input.limit ?? 100),
      ...(input.oldest ? { oldest: input.oldest } : {}),
    })
    const { data, latencyMs } = await httpRequest<{ ok: boolean; messages: unknown[] }>(
      `${BASE}/conversations.history?${params}`,
      { method: 'GET', accessToken: creds.accessToken }
    )
    return { success: data.ok, data: data.messages, latencyMs }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

async function getUserInfo(
  creds: ConnectorCredentials,
  input: { userId: string }
): Promise<ConnectorActionResult> {
  try {
    const { data, latencyMs } = await httpRequest<{ ok: boolean; user: unknown }>(
      `${BASE}/users.info?user=${input.userId}`,
      { method: 'GET', accessToken: creds.accessToken }
    )
    return { success: data.ok, data: data.user, latencyMs }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export const slackConnector: ConnectorDefinition = {
  provider: 'slack',
  displayName: 'Slack',
  description: 'Team messaging and collaboration platform',
  authMethods: ['oauth2_pkce'],
  requiredScopes: ['chat:write', 'channels:history', 'channels:read', 'users:read'],
  oauthConfig: {
    authorizationUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    scopes: ['chat:write', 'channels:history', 'channels:read', 'users:read'],
  },
  actions: {
    'messages.post': postMessage,
    'channels.list': listChannels,
    'channels.history': getChannelHistory,
    'users.get': getUserInfo,
  },
}

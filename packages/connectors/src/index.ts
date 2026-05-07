export * from './types'
export { zendeskConnector } from './providers/zendesk'
export { slackConnector } from './providers/slack'
export { githubConnector, notionConnector } from './providers/github_notion'

import { zendeskConnector } from './providers/zendesk'
import { slackConnector } from './providers/slack'
import { githubConnector, notionConnector } from './providers/github_notion'
import type { ConnectorDefinition } from './types'

export const connectorRegistry: Record<string, ConnectorDefinition> = {
  zendesk: zendeskConnector,
  slack: slackConnector,
  github: githubConnector,
  notion: notionConnector,
}

export function getConnectorDefinition(provider: string): ConnectorDefinition {
  const def = connectorRegistry[provider]
  if (!def) throw new Error(`No connector definition for provider: ${provider}`)
  return def
}

export async function executeConnectorAction(
  provider: string,
  action: string,
  credentials: import('./types').ConnectorCredentials,
  input: unknown
): Promise<import('./types').ConnectorActionResult> {
  const def = getConnectorDefinition(provider)
  const fn = def.actions[action]
  if (!fn) throw new Error(`No action '${action}' for provider '${provider}'`)
  return fn(credentials, input as Record<string, unknown>)
}

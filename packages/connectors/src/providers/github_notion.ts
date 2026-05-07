import { ConnectorDefinition, ConnectorCredentials, ConnectorActionResult, httpRequest } from '../types'

// ── GITHUB ──────────────────────────────────────────────────────
const GH_BASE = 'https://api.github.com'

async function listPullRequests(
  creds: ConnectorCredentials,
  input: { owner: string; repo: string; state?: string; limit?: number }
): Promise<ConnectorActionResult> {
  try {
    const params = new URLSearchParams({
      state: input.state ?? 'open',
      per_page: String(input.limit ?? 10),
    })
    const { data, latencyMs } = await httpRequest<unknown[]>(
      `${GH_BASE}/repos/${input.owner}/${input.repo}/pulls?${params}`,
      { method: 'GET', accessToken: creds.accessToken, headers: { 'Accept': 'application/vnd.github.v3+json' } }
    )
    return { success: true, data, latencyMs }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

async function getPullRequestDiff(
  creds: ConnectorCredentials,
  input: { owner: string; repo: string; pullNumber: number }
): Promise<ConnectorActionResult> {
  try {
    const { data, latencyMs } = await httpRequest<string>(
      `${GH_BASE}/repos/${input.owner}/${input.repo}/pulls/${input.pullNumber}`,
      {
        method: 'GET',
        accessToken: creds.accessToken,
        headers: { 'Accept': 'application/vnd.github.v3.diff' },
      }
    )
    return { success: true, data, latencyMs }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

async function getPullRequestFiles(
  creds: ConnectorCredentials,
  input: { owner: string; repo: string; pullNumber: number }
): Promise<ConnectorActionResult> {
  try {
    const { data, latencyMs } = await httpRequest<unknown[]>(
      `${GH_BASE}/repos/${input.owner}/${input.repo}/pulls/${input.pullNumber}/files`,
      { method: 'GET', accessToken: creds.accessToken, headers: { 'Accept': 'application/vnd.github.v3+json' } }
    )
    return { success: true, data, latencyMs }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

async function createIssue(
  creds: ConnectorCredentials,
  input: { owner: string; repo: string; title: string; body: string; labels?: string[] }
): Promise<ConnectorActionResult> {
  try {
    const { data, latencyMs } = await httpRequest<unknown>(
      `${GH_BASE}/repos/${input.owner}/${input.repo}/issues`,
      {
        method: 'POST',
        accessToken: creds.accessToken,
        headers: { 'Accept': 'application/vnd.github.v3+json' },
        body: JSON.stringify({ title: input.title, body: input.body, labels: input.labels ?? [] }),
      }
    )
    return { success: true, data, latencyMs }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

async function addPRReviewComment(
  creds: ConnectorCredentials,
  input: { owner: string; repo: string; pullNumber: number; body: string }
): Promise<ConnectorActionResult> {
  try {
    const { data, latencyMs } = await httpRequest<unknown>(
      `${GH_BASE}/repos/${input.owner}/${input.repo}/issues/${input.pullNumber}/comments`,
      {
        method: 'POST',
        accessToken: creds.accessToken,
        headers: { 'Accept': 'application/vnd.github.v3+json' },
        body: JSON.stringify({ body: input.body }),
      }
    )
    return { success: true, data, latencyMs }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export const githubConnector: ConnectorDefinition = {
  provider: 'github',
  displayName: 'GitHub',
  description: 'Code hosting and collaboration platform',
  authMethods: ['oauth2_pkce', 'api_key'],
  requiredScopes: ['repo', 'pull_requests:read'],
  oauthConfig: {
    authorizationUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    scopes: ['repo'],
  },
  actions: {
    'pulls.list': listPullRequests,
    'pulls.diff': getPullRequestDiff,
    'pulls.files': getPullRequestFiles,
    'issues.create': createIssue,
    'pulls.comment': addPRReviewComment,
  },
}

// ── NOTION ──────────────────────────────────────────────────────
const NOTION_BASE = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'

async function createPage(
  creds: ConnectorCredentials,
  input: {
    parentDatabaseId?: string
    parentPageId?: string
    title: string
    content: string
    properties?: Record<string, unknown>
  }
): Promise<ConnectorActionResult> {
  try {
    const parent = input.parentDatabaseId
      ? { database_id: input.parentDatabaseId }
      : { page_id: input.parentPageId }

    const { data, latencyMs } = await httpRequest<unknown>(
      `${NOTION_BASE}/pages`,
      {
        method: 'POST',
        accessToken: creds.accessToken,
        headers: { 'Notion-Version': NOTION_VERSION },
        body: JSON.stringify({
          parent,
          properties: {
            title: {
              title: [{ text: { content: input.title } }],
            },
            ...input.properties,
          },
          children: [
            {
              object: 'block',
              type: 'paragraph',
              paragraph: {
                rich_text: [{ text: { content: input.content } }],
              },
            },
          ],
        }),
      }
    )
    return { success: true, data, latencyMs }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

async function queryDatabase(
  creds: ConnectorCredentials,
  input: { databaseId: string; filter?: unknown; sorts?: unknown[] }
): Promise<ConnectorActionResult> {
  try {
    const { data, latencyMs } = await httpRequest<{ results: unknown[] }>(
      `${NOTION_BASE}/databases/${input.databaseId}/query`,
      {
        method: 'POST',
        accessToken: creds.accessToken,
        headers: { 'Notion-Version': NOTION_VERSION },
        body: JSON.stringify({ filter: input.filter, sorts: input.sorts }),
      }
    )
    return { success: true, data: (data as { results: unknown[] }).results, latencyMs }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

async function updatePage(
  creds: ConnectorCredentials,
  input: { pageId: string; properties: Record<string, unknown> }
): Promise<ConnectorActionResult> {
  try {
    const { data, latencyMs } = await httpRequest<unknown>(
      `${NOTION_BASE}/pages/${input.pageId}`,
      {
        method: 'PATCH',
        accessToken: creds.accessToken,
        headers: { 'Notion-Version': NOTION_VERSION },
        body: JSON.stringify({ properties: input.properties }),
      }
    )
    return { success: true, data, latencyMs }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export const notionConnector: ConnectorDefinition = {
  provider: 'notion',
  displayName: 'Notion',
  description: 'All-in-one workspace for notes, docs, and databases',
  authMethods: ['oauth2_pkce'],
  requiredScopes: ['pages:write', 'databases:read'],
  oauthConfig: {
    authorizationUrl: 'https://api.notion.com/v1/oauth/authorize',
    tokenUrl: 'https://api.notion.com/v1/oauth/token',
    scopes: [],
  },
  actions: {
    'pages.create': createPage,
    'databases.query': queryDatabase,
    'pages.update': updatePage,
  },
}

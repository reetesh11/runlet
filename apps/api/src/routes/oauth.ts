import { Hono } from 'hono'
import { db, connectors, credentialStore, oauthStates } from '@runlet/db'
import { eq, and } from 'drizzle-orm'
import { generateId, encrypt } from '@runlet/utils'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email openid'

// ── OAuth start — protected, workspace-scoped ──────────────────
// POST /v1/workspaces/:workspaceId/oauth/google/start
export const oauthStartRoutes = new Hono<{
  Variables: { userId: string; userEmail: string; workspaceId: string; workspaceRole: string }
}>()

oauthStartRoutes.post('/google/start', async (c) => {
  const workspaceId = c.get('workspaceId') as string
  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) return c.json({ error: 'GOOGLE_CLIENT_ID not configured' }, 500)

  const state = generateId('oas')
  const redirectUri = `${process.env.API_URL ?? 'http://localhost:3001'}/v1/oauth/google/callback`

  await db.insert(oauthStates).values({
    id: generateId('ost'),
    workspaceId,
    provider: 'gmail',
    state,
    redirectTo: `${process.env.WEB_URL ?? 'http://localhost:3000'}/workspace/${workspaceId}/settings/connectors?connected=gmail`,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  })

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GMAIL_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
  })

  return c.json({ data: { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` } })
})

// ── OAuth callback — public (browser redirect from Google) ──────
// GET /v1/oauth/google/callback
export const oauthCallbackRoutes = new Hono()

oauthCallbackRoutes.get('/google/callback', async (c) => {
  const code = c.req.query('code')
  const state = c.req.query('state')
  const error = c.req.query('error')

  const webUrl = process.env.WEB_URL ?? 'http://localhost:3000'

  if (error || !code || !state) {
    return c.redirect(`${webUrl}/settings/connectors?error=oauth_denied`)
  }

  const stateRow = await db.query.oauthStates.findFirst({
    where: eq(oauthStates.state, state),
  })

  if (!stateRow || stateRow.expiresAt < new Date()) {
    return c.redirect(`${webUrl}/settings/connectors?error=oauth_expired`)
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return c.redirect(`${webUrl}/settings/connectors?error=config_missing`)
  }

  const redirectUri = `${process.env.API_URL ?? 'http://localhost:3001'}/v1/oauth/google/callback`

  // Exchange code for tokens
  const tokenResp = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
  })

  if (!tokenResp.ok) {
    console.error('[OAuth] Token exchange failed:', await tokenResp.text())
    return c.redirect(`${webUrl}/settings/connectors?error=token_exchange_failed`)
  }

  const tokens = await tokenResp.json() as {
    access_token: string
    refresh_token?: string
    expires_in: number
    token_type: string
  }

  if (!tokens.refresh_token) {
    console.warn('[OAuth] No refresh_token received — user may need to revoke and reconnect')
  }

  // Get user's email address
  let emailAddress = 'Connected'
  try {
    const userResp = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    if (userResp.ok) {
      const user = await userResp.json() as { email?: string }
      if (user.email) emailAddress = user.email
    }
  } catch {
    // non-fatal
  }

  const encKey = process.env.CONFIG_ENCRYPTION_KEY!
  const workspaceId = stateRow.workspaceId
  const tokenExpiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  // Check if gmail connector already exists for this workspace
  const existing = await db.query.connectors.findFirst({
    where: and(
      eq(connectors.workspaceId, workspaceId),
      eq(connectors.provider, 'gmail')
    ),
  })

  const credentialData = JSON.stringify({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    tokenExpiry,
    clientId,
    clientSecret,
    emailAddress,
  })

  if (existing) {
    // Update existing connector credentials
    const existingCred = await db.query.credentialStore.findFirst({
      where: eq(credentialStore.connectorId, existing.id),
    })
    if (existingCred) {
      await db.update(credentialStore).set({
        encryptedData: encrypt(credentialData, encKey),
        expiresAt: new Date(tokenExpiry),
        updatedAt: new Date(),
      }).where(eq(credentialStore.id, existingCred.id))
    }
    await db.update(connectors).set({
      displayName: `Gmail (${emailAddress})`,
      healthStatus: 'healthy',
      metadata: { emailAddress },
      updatedAt: new Date(),
    }).where(eq(connectors.id, existing.id))
  } else {
    // Create new connector + credential
    const connId = generateId('con')
    const credId = generateId('crd')

    await db.insert(connectors).values({
      id: connId,
      workspaceId,
      displayName: `Gmail (${emailAddress})`,
      provider: 'gmail',
      authMethod: 'oauth2_pkce',
      credentialRef: credId,
      grantedScopes: ['https://www.googleapis.com/auth/gmail.readonly'],
      healthStatus: 'healthy',
      metadata: { emailAddress },
    })

    await db.insert(credentialStore).values({
      id: credId,
      connectorId: connId,
      encryptedData: encrypt(credentialData, encKey),
      expiresAt: new Date(tokenExpiry),
    })
  }

  // Clean up oauth state
  await db.delete(oauthStates).where(eq(oauthStates.state, state))

  const redirectTo = stateRow.redirectTo ?? `${webUrl}/settings/connectors?connected=gmail`
  return c.redirect(redirectTo)
})

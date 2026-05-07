import { db, auditEvents, connectors, credentialStore } from '@runlet/db'
import { generateId, decrypt } from '@runlet/utils'
import type { AuditEventType, GuardrailResult, LLMMetadata, ConnectorCallMetadata } from '@runlet/types'
import type { ConnectorCredentials } from '@runlet/connectors'

// ── Audit writer ───────────────────────────────────────────────
interface WriteAuditEventParams {
  runId: string
  workspaceId: string
  eventType: AuditEventType
  actor?: { type: 'system' | 'user' | 'connector'; id?: string }
  payloadHash?: string
  guardrailResults?: GuardrailResult[]
  llmMetadata?: LLMMetadata
  connectorCall?: ConnectorCallMetadata
  metadata?: Record<string, unknown>
}

export async function writeAuditEvent(params: WriteAuditEventParams): Promise<void> {
  await db.insert(auditEvents).values({
    id: generateId('evt'),
    runId: params.runId,
    workspaceId: params.workspaceId,
    eventType: params.eventType,
    occurredAt: new Date(),
    actor: params.actor ?? { type: 'system' },
    payloadHash: params.payloadHash,
    guardrailResults: params.guardrailResults,
    llmMetadata: params.llmMetadata,
    connectorCall: params.connectorCall,
    metadata: params.metadata,
  })
}

// ── Credential resolver ────────────────────────────────────────
// Resolves connector credentials from the encrypted credential store.
// Returns short-lived-style credentials (decrypted from DB).
// In production, this would issue short-lived vault tokens.

export async function resolveCredentials(
  connectorId: string,
  workspaceId: string
): Promise<ConnectorCredentials> {
  const connector = await db.query.connectors.findFirst({
    where: (c, { and, eq }) => and(
      eq(c.id, connectorId),
      eq(c.workspaceId, workspaceId)
    ),
  })

  if (!connector) throw new Error(`Connector not found: ${connectorId}`)

  // Load from credential store
  const cred = await db.query.credentialStore.findFirst({
    where: (c, { eq }) => eq(c.connectorId, connectorId),
    orderBy: (c, { desc }) => [desc(c.createdAt)],
  })

  if (!cred) throw new Error(`No credentials found for connector: ${connectorId}`)

  const encKey = process.env.CONFIG_ENCRYPTION_KEY!
  const decrypted = decrypt(cred.encryptedData, encKey)
  return JSON.parse(decrypted) as ConnectorCredentials
}

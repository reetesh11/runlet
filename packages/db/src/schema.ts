import {
  pgTable, pgEnum, text, integer, boolean,
  timestamp, jsonb, real, index, uniqueIndex, primaryKey,
} from 'drizzle-orm/pg-core'

// ── Enums ───────────────────────────────────────────────────────
export const agentStatusEnum = pgEnum('agent_status', ['draft', 'published', 'archived'])
export const agentVisibilityEnum = pgEnum('agent_visibility', ['draft', 'private', 'unlisted', 'public'])
export const agentLicenceEnum = pgEnum('agent_licence', ['runlet_open', 'mit', 'commercial_only', 'private'])
export const versionStatusEnum = pgEnum('version_status', ['draft', 'published'])
export const connectorProviderEnum = pgEnum('connector_provider', ['zendesk', 'slack', 'github', 'notion', 'salesforce', 'hubspot', 'jira', 'linear', 'gmail', 'custom'])
export const connectorAuthMethodEnum = pgEnum('connector_auth_method', ['oauth2_pkce', 'oauth2_client_credentials', 'api_key', 'basic_auth', 'webhook_signing'])
export const connectorHealthEnum = pgEnum('connector_health', ['healthy', 'degraded', 'expired', 'revoked', 'unknown'])
export const deploymentStatusEnum = pgEnum('deployment_status', ['saved_draft', 'active', 'paused', 'upgrading', 'error', 'deprecated'])
export const deploymentEnvEnum = pgEnum('deployment_env', ['sandbox', 'production'])
export const triggerTypeEnum = pgEnum('trigger_type', ['webhook', 'schedule', 'connector_event', 'flow_node', 'api_call', 'manual'])
export const executionModeEnum = pgEnum('execution_mode', ['async', 'sync'])
export const runStatusEnum = pgEnum('run_status', ['queued', 'running', 'success', 'failed', 'guardrail_blocked', 'pending_review', 'timeout', 'cancelled'])
export const runQueuePriorityEnum = pgEnum('run_queue_priority', ['realtime', 'standard', 'batch'])
export const auditEventTypeEnum = pgEnum('audit_event_type', ['run_queued', 'run_started', 'guardrail_evaluated', 'llm_called', 'action_executed', 'human_review_requested', 'run_completed', 'run_failed', 'connector_health_checked'])
export const flowStatusEnum = pgEnum('flow_status', ['draft', 'active', 'paused', 'archived'])
export const workspacePlanEnum = pgEnum('workspace_plan', ['free', 'pro', 'enterprise'])
export const workspaceRoleEnum = pgEnum('workspace_role', ['owner', 'admin', 'developer', 'operator', 'viewer'])

// ── Workspaces ─────────────────────────────────────────────────
export const workspaces = pgTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  plan: workspacePlanEnum('plan').default('free').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ── Users ──────────────────────────────────────────────────────
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  image: text('image'),
  passwordHash: text('password_hash'),
  emailVerified: timestamp('email_verified'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ── NextAuth accounts ──────────────────────────────────────────
export const accounts = pgTable('accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  provider: text('provider').notNull(),
  providerAccountId: text('provider_account_id').notNull(),
  refreshToken: text('refresh_token'),
  accessToken: text('access_token'),
  expiresAt: integer('expires_at'),
  tokenType: text('token_type'),
  scope: text('scope'),
  idToken: text('id_token'),
  sessionState: text('session_state'),
}, (table) => ({
  providerIdx: index('accounts_provider_idx').on(table.provider, table.providerAccountId),
}))

// ── NextAuth sessions ──────────────────────────────────────────
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  sessionToken: text('session_token').notNull().unique(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires').notNull(),
})

export const verificationTokens = pgTable('verification_tokens', {
  identifier: text('identifier').notNull(),
  token: text('token').notNull().unique(),
  expires: timestamp('expires').notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.identifier, table.token] }),
  identifierIdx: index('verification_tokens_identifier_idx').on(table.identifier),
}))

// ── Workspace Members ──────────────────────────────────────────
export const workspaceMembers = pgTable('workspace_members', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: workspaceRoleEnum('role').default('developer').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  workspaceUserIdx: index('wm_workspace_user_idx').on(table.workspaceId, table.userId),
}))

// ── Agents ─────────────────────────────────────────────────────
export const agents = pgTable('agents', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  displayName: text('display_name').notNull(),
  tagline: text('tagline').notNull(),
  descriptionLong: text('description_long'),
  vertical: text('vertical').notNull(),
  category: text('category').notNull(),
  tags: text('tags').array().default([]).notNull(),
  thumbnailUrl: text('thumbnail_url'),
  status: agentStatusEnum('status').default('draft').notNull(),
  visibility: agentVisibilityEnum('visibility').default('draft').notNull(),
  licence: agentLicenceEnum('licence').default('runlet_open').notNull(),
  authorId: text('author_id').notNull().references(() => users.id),
  forkOriginId: text('fork_origin_id'),
  latestPublishedVersionId: text('latest_published_version_id'),
  starCount: integer('star_count').default(0).notNull(),
  installCount: integer('install_count').default(0).notNull(),
  avgRunSuccessRate: real('avg_run_success_rate').default(0).notNull(),
  searchVector: text('search_vector'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  verticalIdx: index('agents_vertical_idx').on(table.vertical),
  statusIdx: index('agents_status_idx').on(table.status, table.visibility),
}))

// ── Agent Versions ─────────────────────────────────────────────
export const agentVersions = pgTable('agent_versions', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  semver: text('semver').notNull(),
  promptRef: text('prompt_ref'),
  promptBody: text('prompt_body'),
  modelConfig: jsonb('model_config').notNull().$type<{
    provider: string; modelId: string; temperature: number; maxTokens: number
  }>(),
  inputSchema: jsonb('input_schema').notNull().$type<Record<string, unknown>>(),
  outputSchema: jsonb('output_schema').notNull().$type<Record<string, unknown>>(),
  requiredConnectors: jsonb('required_connectors').notNull().$type<Array<{
    provider: string; scopes: string[]; optional?: boolean
  }>>(),
  guardrailRules: jsonb('guardrail_rules').notNull().$type<Array<{
    type: string; condition?: string; action?: string; severity: string; config?: Record<string, unknown>
  }>>(),
  timeoutSeconds: integer('timeout_seconds').default(60).notNull(),
  retryPolicy: jsonb('retry_policy').$type<{
    maxAttempts: number; backoffStrategy: string; retryableErrors: string[]
  }>(),
  changelogNotes: text('changelog_notes'),
  versionHash: text('version_hash'),
  status: versionStatusEnum('status').default('draft').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  agentSemverIdx: index('av_agent_semver_idx').on(table.agentId, table.semver),
}))

// ── Connectors ─────────────────────────────────────────────────
export const connectors = pgTable('connectors', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  displayName: text('display_name').notNull(),
  provider: connectorProviderEnum('provider').notNull(),
  authMethod: connectorAuthMethodEnum('auth_method').notNull(),
  credentialRef: text('credential_ref').notNull(),
  grantedScopes: text('granted_scopes').array().default([]).notNull(),
  healthStatus: connectorHealthEnum('health_status').default('unknown').notNull(),
  lastUsedAt: timestamp('last_used_at'),
  usageCount: integer('usage_count').default(0).notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  workspaceProviderIdx: index('connectors_workspace_provider_idx').on(table.workspaceId, table.provider),
}))

// ── Credential Store (encrypted) ───────────────────────────────
export const credentialStore = pgTable('credential_store', {
  id: text('id').primaryKey(),
  connectorId: text('connector_id').notNull().references(() => connectors.id, { onDelete: 'cascade' }),
  encryptedData: text('encrypted_data').notNull(),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ── Deployments ────────────────────────────────────────────────
export const deployments = pgTable('deployments', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  agentId: text('agent_id').notNull().references(() => agents.id),
  agentVersionId: text('agent_version_id').notNull().references(() => agentVersions.id),
  instanceName: text('instance_name').notNull(),
  deploymentEnv: deploymentEnvEnum('deployment_env').default('production').notNull(),
  ownerTeam: text('owner_team'),
  connectorBindings: jsonb('connector_bindings').notNull().$type<Array<{
    connectorRef: string; connectorId: string; connectorName: string
  }>>(),
  encryptedConfig: text('encrypted_config'),
  guardrailOverrides: jsonb('guardrail_overrides').$type<Record<string, unknown>>(),
  triggerType: triggerTypeEnum('trigger_type').default('webhook').notNull(),
  triggerConfig: jsonb('trigger_config').default({}).notNull().$type<Record<string, unknown>>(),
  executionMode: executionModeEnum('execution_mode').default('async').notNull(),
  alertChannels: jsonb('alert_channels').default([]).notNull().$type<Array<{
    type: string; destination: string; events: string[]
  }>>(),
  maxRunsPerHour: integer('max_runs_per_hour').default(1000).notNull(),
  status: deploymentStatusEnum('status').default('saved_draft').notNull(),
  webhookUrl: text('webhook_url'),
  webhookSecret: text('webhook_secret'),
  runCount: integer('run_count').default(0).notNull(),
  lastRunAt: timestamp('last_run_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  workspaceIdx: index('deployments_workspace_idx').on(table.workspaceId),
  statusIdx: index('deployments_status_idx').on(table.workspaceId, table.status),
}))

// ── Workspace Agents (pulled agents) ───────────────────────────
export const workspaceAgents = pgTable('workspace_agents', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  agentId: text('agent_id').notNull().references(() => agents.id),
  pinnedVersionId: text('pinned_version_id').notNull().references(() => agentVersions.id),
  installedBy: text('installed_by').notNull().references(() => users.id),
  installedAt: timestamp('installed_at').defaultNow().notNull(),
}, (table) => ({
  workspaceAgentIdx: index('wa_workspace_agent_idx').on(table.workspaceId, table.agentId),
}))

// ── Flows ──────────────────────────────────────────────────────
export const flows = pgTable('flows', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  graphDef: jsonb('graph_def').notNull().$type<{
    nodes: Array<{
      nodeId: string; nodeType: string; label: string
      deploymentId?: string; flowId?: string
      position?: { x: number; y: number }
      config?: Record<string, unknown>
    }>
    edges: Array<{
      edgeId: string; from: string; to: string
      condition?: string; dataMapping?: Record<string, string>
      executionMode?: string; label?: string
    }>
  }>(),
  inputSchema: jsonb('input_schema').$type<Record<string, unknown>>(),
  outputSchema: jsonb('output_schema').$type<Record<string, unknown>>(),
  status: flowStatusEnum('status').default('draft').notNull(),
  trigger: jsonb('trigger').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  workspaceIdx: index('flows_workspace_idx').on(table.workspaceId),
}))

// ── Runs ───────────────────────────────────────────────────────
export const runs = pgTable('runs', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  deploymentId: text('deployment_id').references(() => deployments.id),
  flowId: text('flow_id').references(() => flows.id),
  flowRunId: text('flow_run_id'),
  parentRunId: text('parent_run_id'),
  depth: integer('depth').default(0).notNull(),
  status: runStatusEnum('status').default('queued').notNull(),
  queuePriority: runQueuePriorityEnum('queue_priority').default('standard').notNull(),
  inputPayloadRef: text('input_payload_ref'),
  outputPayloadRef: text('output_payload_ref'),
  triggerType: triggerTypeEnum('trigger_type').default('api_call').notNull(),
  triggerMetadata: jsonb('trigger_metadata').$type<Record<string, unknown>>(),
  durationMs: integer('duration_ms'),
  llmTokensUsed: integer('llm_tokens_used'),
  llmCostUsd: real('llm_cost_usd'),
  guardrailResults: jsonb('guardrail_results').$type<Array<{
    type: string; passed: boolean; reason?: string; actionTaken?: string
  }>>(),
  confidenceScore: real('confidence_score'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
}, (table) => ({
  workspaceIdx: index('runs_workspace_idx').on(table.workspaceId),
  deploymentIdx: index('runs_deployment_idx').on(table.deploymentId),
  statusIdx: index('runs_status_idx').on(table.workspaceId, table.status),
  createdAtIdx: index('runs_created_at_idx').on(table.createdAt),
}))

// ── Flow Runs ──────────────────────────────────────────────────
export const flowRuns = pgTable('flow_runs', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  flowId: text('flow_id').notNull().references(() => flows.id),
  parentFlowRunId: text('parent_flow_run_id'),
  status: runStatusEnum('status').default('queued').notNull(),
  depth: integer('depth').default(0).notNull(),
  inputPayloadRef: text('input_payload_ref'),
  outputPayloadRef: text('output_payload_ref'),
  nodeStates: jsonb('node_states').default({}).notNull().$type<Record<string, {
    status: string; runId?: string
    startedAt?: string; completedAt?: string; errorMessage?: string
  }>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
}, (table) => ({
  flowIdx: index('flow_runs_flow_idx').on(table.flowId),
  workspaceIdx: index('flow_runs_workspace_idx').on(table.workspaceId),
}))

// ── Audit Events (append-only) ─────────────────────────────────
export const auditEvents = pgTable('audit_events', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => runs.id),
  workspaceId: text('workspace_id').notNull(),
  eventType: auditEventTypeEnum('event_type').notNull(),
  occurredAt: timestamp('occurred_at').defaultNow().notNull(),
  actor: jsonb('actor').notNull().$type<{ type: string; id?: string }>(),
  payloadHash: text('payload_hash'),
  guardrailResults: jsonb('guardrail_results').$type<Array<{
    type: string; passed: boolean; reason?: string; actionTaken?: string
  }>>(),
  llmMetadata: jsonb('llm_metadata').$type<{
    modelId: string; provider: string; promptTokens: number
    completionTokens: number; latencyMs: number; confidenceScore?: number
  }>(),
  connectorCall: jsonb('connector_call').$type<{
    provider: string; actionPrimitive: string; responseStatus: number; latencyMs: number
  }>(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
}, (table) => ({
  runIdx: index('audit_run_idx').on(table.runId),
  workspaceIdx: index('audit_workspace_idx').on(table.workspaceId),
  occurredAtIdx: index('audit_occurred_at_idx').on(table.occurredAt),
}))

// ── Human Review Requests ──────────────────────────────────────
export const humanReviewRequests = pgTable('human_review_requests', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => runs.id),
  workspaceId: text('workspace_id').notNull(),
  deploymentId: text('deployment_id').references(() => deployments.id),
  inputSummary: text('input_summary'),
  proposedOutput: jsonb('proposed_output').$type<Record<string, unknown>>(),
  confidenceScore: real('confidence_score'),
  reviewedBy: text('reviewed_by').references(() => users.id),
  reviewDecision: text('review_decision'),
  reviewNotes: text('review_notes'),
  resolvedAt: timestamp('resolved_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ── Connector OAuth State ──────────────────────────────────────
export const oauthStates = pgTable('oauth_states', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  provider: text('provider').notNull(),
  state: text('state').notNull().unique(),
  codeVerifier: text('code_verifier'),
  redirectTo: text('redirect_to'),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ── Workspace Secrets (LLM keys, email keys, etc.) ────────────
export const workspaceSecrets = pgTable('workspace_secrets', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  keyName: text('key_name').notNull(),
  encryptedValue: text('encrypted_value').notNull(),
  hint: text('hint'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  uniqueKey: uniqueIndex('ws_secrets_key_idx').on(table.workspaceId, table.keyName),
}))

// ── Agent Stars ────────────────────────────────────────────────
export const agentStars = pgTable('agent_stars', {
  agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.agentId, table.userId] }),
}))

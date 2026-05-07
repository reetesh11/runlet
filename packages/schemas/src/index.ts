import { z } from 'zod'

// ── Agent Schemas ──────────────────────────────────────────────
export const CreateAgentSchema = z.object({
  slug: z.string().min(3).max(80).regex(/^[a-z0-9-]+$/),
  displayName: z.string().min(3).max(80),
  tagline: z.string().min(10).max(120),
  descriptionLong: z.string().optional(),
  vertical: z.string(),
  category: z.string(),
  tags: z.array(z.string()).max(10).default([]),
  thumbnailUrl: z.string().url().optional(),
  licence: z.enum(['runlet_open', 'mit', 'commercial_only', 'private']).default('runlet_open'),
  visibility: z.enum(['draft', 'private', 'unlisted', 'public']).default('draft'),
})

export const UpdateAgentSchema = CreateAgentSchema.partial()

export const CreateAgentVersionSchema = z.object({
  semver: z.string().regex(/^\d+\.\d+\.\d+$/),
  promptBody: z.string().min(100),
  modelConfig: z.object({
    provider: z.enum(['anthropic', 'openai']),
    modelId: z.string(),
    temperature: z.number().min(0).max(2),
    maxTokens: z.number().min(1).max(8000),
    topP: z.number().min(0).max(1).optional(),
  }),
  inputSchema: z.record(z.unknown()),
  outputSchema: z.record(z.unknown()),
  requiredConnectors: z.array(z.object({
    provider: z.string(),
    scopes: z.array(z.string()),
    optional: z.boolean().optional(),
  })),
  guardrailRules: z.array(z.object({
    type: z.enum(['topic_block', 'confidence_gate', 'pii_mask', 'action_confirm', 'rate_limit', 'schema_validate']),
    condition: z.string().optional(),
    action: z.string().optional(),
    severity: z.enum(['warn', 'block']),
    config: z.record(z.unknown()).optional(),
  })),
  timeoutSeconds: z.number().min(5).max(600).default(60),
  retryPolicy: z.object({
    maxAttempts: z.number().min(1).max(5),
    backoffStrategy: z.enum(['fixed', 'exponential']),
    retryableErrors: z.array(z.string()),
  }).optional(),
  changelogNotes: z.string().optional(),
})

// ── Connector Schemas ──────────────────────────────────────────
export const CreateConnectorSchema = z.object({
  displayName: z.string().min(1).max(100),
  provider: z.enum(['zendesk', 'slack', 'github', 'notion', 'salesforce', 'hubspot', 'jira', 'linear', 'custom']),
  authMethod: z.enum(['oauth2_pkce', 'oauth2_client_credentials', 'api_key', 'basic_auth', 'webhook_signing']),
  apiKey: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
})

// ── Deployment Schemas ─────────────────────────────────────────
export const CreateDeploymentSchema = z.object({
  agentId: z.string(),
  agentVersionId: z.string(),
  instanceName: z.string().min(1).max(100),
  deploymentEnv: z.enum(['sandbox', 'production']).default('production'),
  ownerTeam: z.string().optional(),
  connectorBindings: z.array(z.object({
    connectorRef: z.string(),
    connectorId: z.string(),
    connectorName: z.string(),
  })),
  config: z.record(z.unknown()).default({}),
  guardrailOverrides: z.object({
    topicBlocklist: z.array(z.string()).optional(),
    confidenceThreshold: z.number().min(0).max(1).optional(),
    piiHandlingPolicy: z.enum(['pass_through', 'mask_in_logs', 'redact_before_llm', 'reject_if_present']).optional(),
    actionConfirmationMode: z.enum(['auto', 'confirm_above_threshold', 'always_confirm']).optional(),
    fallbackBehaviour: z.enum(['escalate_to_human', 'return_error', 'invoke_fallback_agent', 'skip_silently']).optional(),
    maxRunsPerHour: z.number().min(1).max(100000).optional(),
  }).optional(),
  triggerType: z.enum(['webhook', 'schedule', 'connector_event', 'flow_node', 'api_call', 'manual']).default('webhook'),
  triggerConfig: z.record(z.unknown()).default({}),
  executionMode: z.enum(['async', 'sync']).default('async'),
  alertChannels: z.array(z.object({
    type: z.enum(['slack', 'email', 'webhook']),
    destination: z.string(),
    events: z.array(z.string()),
  })).default([]),
  maxRunsPerHour: z.number().min(1).max(100000).default(1000),
})

export const UpdateDeploymentSchema = CreateDeploymentSchema.partial()

// ── Flow Schemas ───────────────────────────────────────────────
export const FlowNodeSchema = z.object({
  nodeId: z.string(),
  nodeType: z.enum(['agent_deployment', 'sub_flow', 'human_review_gate', 'transform']),
  label: z.string(),
  deploymentId: z.string().optional(),
  flowId: z.string().optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  config: z.record(z.unknown()).optional(),
})

export const FlowEdgeSchema = z.object({
  edgeId: z.string(),
  from: z.string(),
  to: z.string(),
  condition: z.string().optional(),
  dataMapping: z.record(z.string()).optional(),
  executionMode: z.enum(['sequential', 'parallel']).default('sequential'),
  label: z.string().optional(),
})

export const CreateFlowSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  graphDef: z.object({
    nodes: z.array(FlowNodeSchema),
    edges: z.array(FlowEdgeSchema),
  }),
  inputSchema: z.record(z.unknown()).optional(),
  outputSchema: z.record(z.unknown()).optional(),
  trigger: z.record(z.unknown()).optional(),
})

export const UpdateFlowSchema = CreateFlowSchema.partial()

// ── Run Schemas ────────────────────────────────────────────────
export const TriggerRunSchema = z.object({
  input: z.record(z.unknown()),
  executionMode: z.enum(['async', 'sync']).default('async'),
  priority: z.enum(['realtime', 'standard', 'batch']).default('standard'),
})

// ── Query Schemas ──────────────────────────────────────────────
export const PaginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
})

export const MarketplaceSearchSchema = z.object({
  q: z.string().optional(),
  vertical: z.string().optional(),
  category: z.string().optional(),
  connector: z.string().optional(),
  sort: z.enum(['popular', 'trending', 'newest', 'rating']).default('popular'),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(50).default(20),
})

export const RunsQuerySchema = z.object({
  status: z.string().optional(),
  deploymentId: z.string().optional(),
  flowId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
})

// ── Workspace Schemas ──────────────────────────────────────────
export const CreateWorkspaceSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/),
})

export type CreateAgent = z.infer<typeof CreateAgentSchema>
export type CreateAgentVersion = z.infer<typeof CreateAgentVersionSchema>
export type CreateConnector = z.infer<typeof CreateConnectorSchema>
export type CreateDeployment = z.infer<typeof CreateDeploymentSchema>
export type CreateFlow = z.infer<typeof CreateFlowSchema>
export type TriggerRun = z.infer<typeof TriggerRunSchema>
export type MarketplaceSearch = z.infer<typeof MarketplaceSearchSchema>

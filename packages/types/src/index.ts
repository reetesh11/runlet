// ── Agent ────────────────────────────────────────────────────
export type AgentStatus = 'draft' | 'published' | 'archived'
export type AgentVisibility = 'draft' | 'private' | 'unlisted' | 'public'
export type AgentLicence = 'runlet_open' | 'mit' | 'commercial_only' | 'private'

export interface Agent {
  id: string
  slug: string
  displayName: string
  tagline: string
  descriptionLong?: string
  vertical: string
  category: string
  tags: string[]
  thumbnailUrl?: string
  status: AgentStatus
  visibility: AgentVisibility
  licence: AgentLicence
  authorId: string
  forkOriginId?: string
  latestPublishedVersionId?: string
  starCount: number
  installCount: number
  avgRunSuccessRate: number
  createdAt: Date
  updatedAt: Date
}

export interface AgentVersion {
  id: string
  agentId: string
  semver: string
  promptRef: string
  promptBody?: string
  modelConfig: ModelConfig
  inputSchema: Record<string, unknown>
  outputSchema: Record<string, unknown>
  requiredConnectors: RequiredConnector[]
  guardrailRules: GuardrailRule[]
  timeoutSeconds: number
  retryPolicy: RetryPolicy
  changelogNotes?: string
  versionHash: string
  status: 'draft' | 'published'
  createdAt: Date
}

export interface ModelConfig {
  provider: 'anthropic' | 'openai' | 'groq' | 'gemini'
  modelId: string
  temperature: number
  maxTokens: number
  topP?: number
}

export interface RequiredConnector {
  provider: string
  scopes: string[]
  optional?: boolean
}

export interface GuardrailRule {
  type: 'topic_block' | 'confidence_gate' | 'pii_mask' | 'action_confirm' | 'rate_limit' | 'schema_validate'
  condition?: string
  action?: string
  severity: 'warn' | 'block'
  config?: Record<string, unknown>
}

export interface RetryPolicy {
  maxAttempts: number
  backoffStrategy: 'fixed' | 'exponential'
  retryableErrors: string[]
}

// ── Connector ────────────────────────────────────────────────
export type ConnectorProvider = 'zendesk' | 'slack' | 'github' | 'notion' | 'salesforce' | 'hubspot' | 'jira' | 'linear' | 'custom'
export type ConnectorAuthMethod = 'oauth2_pkce' | 'oauth2_client_credentials' | 'api_key' | 'basic_auth' | 'webhook_signing'
export type ConnectorHealthStatus = 'healthy' | 'degraded' | 'expired' | 'revoked' | 'unknown'

export interface Connector {
  id: string
  workspaceId: string
  displayName: string
  provider: ConnectorProvider
  authMethod: ConnectorAuthMethod
  credentialRef: string
  grantedScopes: string[]
  healthStatus: ConnectorHealthStatus
  lastUsedAt?: Date
  usageCount: number
  metadata?: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

// ── Deployment ────────────────────────────────────────────────
export type DeploymentStatus = 'saved_draft' | 'active' | 'paused' | 'upgrading' | 'error' | 'deprecated'
export type TriggerType = 'webhook' | 'schedule' | 'connector_event' | 'flow_node' | 'api_call' | 'manual'
export type ExecutionMode = 'async' | 'sync'

export interface Deployment {
  id: string
  workspaceId: string
  agentVersionId: string
  agentId: string
  instanceName: string
  deploymentEnv: 'sandbox' | 'production'
  ownerTeam?: string
  connectorBindings: ConnectorBinding[]
  config: Record<string, unknown>
  guardrailOverrides?: Partial<GuardrailConfig>
  triggerType: TriggerType
  triggerConfig: Record<string, unknown>
  executionMode: ExecutionMode
  alertChannels: AlertChannel[]
  maxRunsPerHour: number
  status: DeploymentStatus
  webhookUrl?: string
  createdAt: Date
  updatedAt: Date
}

export interface ConnectorBinding {
  connectorRef: string
  connectorId: string
  connectorName: string
}

export interface GuardrailConfig {
  topicBlocklist: string[]
  confidenceThreshold: number
  piiHandlingPolicy: 'pass_through' | 'mask_in_logs' | 'redact_before_llm' | 'reject_if_present'
  actionConfirmationMode: 'auto' | 'confirm_above_threshold' | 'always_confirm'
  fallbackBehaviour: 'escalate_to_human' | 'return_error' | 'invoke_fallback_agent' | 'skip_silently'
  maxRunsPerHour: number
}

export interface AlertChannel {
  type: 'slack' | 'email' | 'webhook'
  destination: string
  events: string[]
}

// ── Run ────────────────────────────────────────────────────────
export type RunStatus = 'queued' | 'running' | 'success' | 'failed' | 'guardrail_blocked' | 'pending_review' | 'timeout' | 'cancelled'
export type RunQueuePriority = 'realtime' | 'standard' | 'batch'

export interface Run {
  id: string
  workspaceId: string
  deploymentId?: string
  flowId?: string
  flowRunId?: string
  parentRunId?: string
  depth: number
  status: RunStatus
  queuePriority: RunQueuePriority
  inputPayloadRef?: string
  outputPayloadRef?: string
  triggerType: TriggerType
  triggerMetadata?: Record<string, unknown>
  durationMs?: number
  llmTokensUsed?: number
  llmCostUsd?: number
  guardrailResults?: GuardrailResult[]
  confidenceScore?: number
  errorMessage?: string
  createdAt: Date
  startedAt?: Date
  completedAt?: Date
}

export interface GuardrailResult {
  type: string
  passed: boolean
  reason?: string
  actionTaken?: string
}

export type AuditEventType =
  | 'run_queued' | 'run_started'
  | 'guardrail_evaluated' | 'llm_called'
  | 'action_executed' | 'human_review_requested'
  | 'run_completed' | 'run_failed'
  | 'connector_health_checked'

export interface AuditEvent {
  id: string
  runId: string
  workspaceId: string
  eventType: AuditEventType
  occurredAt: Date
  actor: { type: 'system' | 'user' | 'connector'; id?: string }
  payloadHash?: string
  guardrailResults?: GuardrailResult[]
  llmMetadata?: LLMMetadata
  connectorCall?: ConnectorCallMetadata
  metadata?: Record<string, unknown>
}

export interface LLMMetadata {
  modelId: string
  provider: string
  promptTokens: number
  completionTokens: number
  latencyMs: number
  confidenceScore?: number
}

export interface ConnectorCallMetadata {
  provider: string
  actionPrimitive: string
  responseStatus: number
  latencyMs: number
}

// ── Flow ────────────────────────────────────────────────────────
export type FlowStatus = 'draft' | 'active' | 'paused' | 'archived'
export type FlowNodeType = 'agent_deployment' | 'sub_flow' | 'human_review_gate' | 'transform'

export interface Flow {
  id: string
  workspaceId: string
  name: string
  description?: string
  graphDef: FlowGraphDef
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  status: FlowStatus
  trigger?: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export interface FlowGraphDef {
  nodes: FlowNode[]
  edges: FlowEdge[]
}

export interface FlowNode {
  nodeId: string
  nodeType: FlowNodeType
  deploymentId?: string
  flowId?: string
  label: string
  position?: { x: number; y: number }
  config?: Record<string, unknown>
}

export interface FlowEdge {
  edgeId: string
  from: string
  to: string
  condition?: string
  dataMapping?: Record<string, string>
  executionMode?: 'sequential' | 'parallel'
  label?: string
}

export interface FlowRun {
  id: string
  workspaceId: string
  flowId: string
  parentFlowRunId?: string
  status: RunStatus
  depth: number
  inputPayloadRef?: string
  outputPayloadRef?: string
  nodeStates: Record<string, FlowNodeState>
  createdAt: Date
  completedAt?: Date
}

export interface FlowNodeState {
  status: RunStatus
  runId?: string
  startedAt?: Date
  completedAt?: Date
  errorMessage?: string
}

// ── Workspace ────────────────────────────────────────────────────
export type WorkspaceRole = 'owner' | 'admin' | 'developer' | 'operator' | 'viewer'

export interface Workspace {
  id: string
  name: string
  slug: string
  plan: 'free' | 'pro' | 'enterprise'
  createdAt: Date
  updatedAt: Date
}

export interface WorkspaceMember {
  id: string
  workspaceId: string
  userId: string
  role: WorkspaceRole
  createdAt: Date
}

// ── API Response types ────────────────────────────────────────────
export interface ApiResponse<T> {
  data: T
  meta?: Record<string, unknown>
}

export interface ApiError {
  error: string
  message: string
  details?: unknown
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

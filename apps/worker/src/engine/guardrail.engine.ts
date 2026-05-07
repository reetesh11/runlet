import type { GuardrailRule, GuardrailResult } from '@runlet/types'

export interface GuardrailContext {
  input: Record<string, unknown>
  inputText?: string
  workspaceId: string
  deploymentId: string
  runsLastHour?: number
  maxRunsPerHour?: number
}

export interface GuardrailEngineResult {
  passed: boolean
  results: GuardrailResult[]
  blockedBy?: string
}

// ── Topic blocker ──────────────────────────────────────────────
function checkTopicBlock(
  rule: GuardrailRule,
  ctx: GuardrailContext
): GuardrailResult {
  const blocklist = (rule.config?.topics as string[]) ?? []
  const text = ctx.inputText ?? JSON.stringify(ctx.input)
  const textLower = text.toLowerCase()

  for (const topic of blocklist) {
    if (textLower.includes(topic.toLowerCase())) {
      return {
        type: 'topic_block',
        passed: false,
        reason: `Input contains blocked topic: "${topic}"`,
        actionTaken: rule.severity === 'block' ? 'blocked' : 'warned',
      }
    }
  }
  return { type: 'topic_block', passed: true }
}

// ── PII scanner ────────────────────────────────────────────────
const PII_PATTERNS = [
  { name: 'email', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g },
  { name: 'phone', pattern: /\b(\+?1?[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g },
  { name: 'ssn', pattern: /\b\d{3}-\d{2}-\d{4}\b/g },
  { name: 'credit_card', pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g },
]

export function detectPii(text: string): Array<{ name: string; count: number }> {
  return PII_PATTERNS
    .map(p => ({ name: p.name, count: (text.match(p.pattern) ?? []).length }))
    .filter(r => r.count > 0)
}

export function maskPii(text: string): string {
  let masked = text
  for (const { pattern, name } of PII_PATTERNS) {
    masked = masked.replace(pattern, `[REDACTED_${name.toUpperCase()}]`)
  }
  return masked
}

function checkPiiScan(
  rule: GuardrailRule,
  ctx: GuardrailContext
): GuardrailResult {
  const text = ctx.inputText ?? JSON.stringify(ctx.input)
  const found = detectPii(text)
  const policy = (rule.config?.policy as string) ?? 'mask_in_logs'

  if (found.length === 0) return { type: 'pii_scan', passed: true }

  if (policy === 'reject_if_present') {
    return {
      type: 'pii_scan',
      passed: false,
      reason: `PII detected: ${found.map(f => f.name).join(', ')}`,
      actionTaken: 'blocked',
    }
  }

  return {
    type: 'pii_scan',
    passed: true,
    reason: `PII found and ${policy === 'mask_in_logs' ? 'masked in logs' : 'redacted'}`,
    actionTaken: policy,
  }
}

// ── Rate limit ─────────────────────────────────────────────────
function checkRateLimit(
  rule: GuardrailRule,
  ctx: GuardrailContext
): GuardrailResult {
  const limit = ctx.maxRunsPerHour ?? (rule.config?.limit as number) ?? 1000
  const current = ctx.runsLastHour ?? 0
  if (current >= limit) {
    return {
      type: 'rate_limit',
      passed: false,
      reason: `Rate limit exceeded: ${current}/${limit} runs per hour`,
      actionTaken: 'blocked',
    }
  }
  return { type: 'rate_limit', passed: true }
}

// ── Schema validation ──────────────────────────────────────────
function checkSchemaValidation(
  rule: GuardrailRule,
  ctx: GuardrailContext
): GuardrailResult {
  const required = (rule.config?.requiredFields as string[]) ?? []
  const missing = required.filter(f => ctx.input[f] === undefined || ctx.input[f] === null)
  if (missing.length > 0) {
    return {
      type: 'schema_validate',
      passed: false,
      reason: `Missing required fields: ${missing.join(', ')}`,
      actionTaken: 'blocked',
    }
  }
  return { type: 'schema_validate', passed: true }
}

// ── Main guardrail runner ──────────────────────────────────────
export async function runGuardrails(
  rules: GuardrailRule[],
  ctx: GuardrailContext,
  phase: 'pre' | 'post' = 'pre'
): Promise<GuardrailEngineResult> {
  const results: GuardrailResult[] = []

  for (const rule of rules) {
    let result: GuardrailResult

    switch (rule.type) {
      case 'topic_block':
        result = checkTopicBlock(rule, ctx)
        break
      case 'pii_mask':
        result = checkPiiScan(rule, ctx)
        break
      case 'rate_limit':
        result = checkRateLimit(rule, ctx)
        break
      case 'schema_validate':
        result = checkSchemaValidation(rule, ctx)
        break
      default:
        result = { type: rule.type, passed: true }
    }

    results.push(result)

    if (!result.passed && rule.severity === 'block') {
      return { passed: false, results, blockedBy: rule.type }
    }
  }

  return { passed: true, results }
}

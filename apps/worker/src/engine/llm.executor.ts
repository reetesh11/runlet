import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import type { ModelConfig } from '@runlet/types'

export interface LLMRequest {
  systemPrompt: string
  userMessage: string
  modelConfig: ModelConfig
  outputSchema?: Record<string, unknown>
}

export interface LLMResponse {
  content: string
  structuredOutput?: Record<string, unknown>
  confidenceScore: number
  promptTokens: number
  completionTokens: number
  latencyMs: number
  modelId: string
}

// ── Anthropic ───────────────────────────────────────────────────
let _anthropic: Anthropic | undefined
function getAnthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _anthropic
}

async function callAnthropic(req: LLMRequest): Promise<LLMResponse> {
  const start = Date.now()
  const client = getAnthropic()

  // Build the user message — if output schema provided, ask for JSON
  let userMessage = req.userMessage
  if (req.outputSchema) {
    userMessage += `\n\nRespond ONLY with a valid JSON object matching this schema (no markdown, no explanation):\n${JSON.stringify(req.outputSchema, null, 2)}\n\nAlso include a "confidence_score" field (0.0 to 1.0) indicating your confidence in the output.`
  }

  const message = await client.messages.create({
    model: req.modelConfig.modelId,
    max_tokens: req.modelConfig.maxTokens,
    temperature: req.modelConfig.temperature,
    system: req.systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })

  const latencyMs = Date.now() - start
  const rawContent = message.content[0]?.type === 'text' ? message.content[0].text : ''

  // Try to parse structured JSON output
  let structuredOutput: Record<string, unknown> | undefined
  let confidenceScore = 0.8

  if (req.outputSchema) {
    try {
      const parsed = JSON.parse(rawContent) as Record<string, unknown>
      confidenceScore = typeof parsed.confidence_score === 'number' ? parsed.confidence_score : 0.8
      structuredOutput = parsed
    } catch {
      // If JSON parse fails, create a structured wrapper
      structuredOutput = { raw_output: rawContent, confidence_score: 0.5 }
      confidenceScore = 0.5
    }
  }

  return {
    content: rawContent,
    structuredOutput,
    confidenceScore,
    promptTokens: message.usage.input_tokens,
    completionTokens: message.usage.output_tokens,
    latencyMs,
    modelId: message.model,
  }
}

// ── OpenAI ──────────────────────────────────────────────────────
let _openai: OpenAI | undefined
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

async function callOpenAI(req: LLMRequest): Promise<LLMResponse> {
  const start = Date.now()
  const client = getOpenAI()

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: req.systemPrompt },
    { role: 'user', content: req.userMessage },
  ]

  if (req.outputSchema) {
    messages[messages.length - 1] = {
      role: 'user',
      content: `${req.userMessage}\n\nRespond ONLY with a valid JSON object. Include a "confidence_score" field (0.0-1.0).`,
    }
  }

  const completion = await client.chat.completions.create({
    model: req.modelConfig.modelId,
    max_tokens: req.modelConfig.maxTokens,
    temperature: req.modelConfig.temperature,
    messages,
    response_format: req.outputSchema ? { type: 'json_object' } : undefined,
  })

  const latencyMs = Date.now() - start
  const rawContent = completion.choices[0]?.message.content ?? ''

  let structuredOutput: Record<string, unknown> | undefined
  let confidenceScore = 0.8

  if (req.outputSchema) {
    try {
      const parsed = JSON.parse(rawContent) as Record<string, unknown>
      confidenceScore = typeof parsed.confidence_score === 'number' ? parsed.confidence_score : 0.8
      structuredOutput = parsed
    } catch {
      structuredOutput = { raw_output: rawContent, confidence_score: 0.5 }
      confidenceScore = 0.5
    }
  }

  return {
    content: rawContent,
    structuredOutput,
    confidenceScore,
    promptTokens: completion.usage?.prompt_tokens ?? 0,
    completionTokens: completion.usage?.completion_tokens ?? 0,
    latencyMs,
    modelId: completion.model,
  }
}

// ── Unified executor ────────────────────────────────────────────
export async function executeLLM(req: LLMRequest): Promise<LLMResponse> {
  const provider = req.modelConfig.provider
  if (provider === 'anthropic') return callAnthropic(req)
  if (provider === 'openai') return callOpenAI(req)
  throw new Error(`Unknown LLM provider: ${provider}`)
}

// ── Cost calculator ─────────────────────────────────────────────
export function calculateLLMCost(
  provider: string,
  modelId: string,
  promptTokens: number,
  completionTokens: number
): number {
  // Approximate pricing per 1M tokens (USD)
  const pricing: Record<string, { input: number; output: number }> = {
    'claude-haiku-4-5-20251001': { input: 0.25, output: 1.25 },
    'claude-sonnet-4-5': { input: 3.0, output: 15.0 },
    'gpt-4o-mini': { input: 0.15, output: 0.6 },
    'gpt-4o': { input: 5.0, output: 15.0 },
  }
  const p = pricing[modelId] ?? { input: 1.0, output: 3.0 }
  return (promptTokens / 1_000_000) * p.input + (completionTokens / 1_000_000) * p.output
}

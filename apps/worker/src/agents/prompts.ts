// Agent prompt definitions for the 5 MVP agents.
// These are the actual prompts used at runtime.

export interface AgentPromptDef {
  slug: string
  systemPrompt: string
  outputSchema: Record<string, unknown>
  modelConfig: {
    provider: 'anthropic' | 'openai'
    modelId: string
    temperature: number
    maxTokens: number
  }
}

export const agentPrompts: Record<string, AgentPromptDef> = {

  // ── 1. Tier-1 Reply ──────────────────────────────────────────
  'tier-1-reply': {
    slug: 'tier-1-reply',
    modelConfig: {
      provider: 'anthropic',
      modelId: process.env.DEFAULT_LLM_MODEL ?? 'claude-haiku-4-5-20251001',
      temperature: 0.3,
      maxTokens: 1000,
    },
    outputSchema: {
      type: 'object',
      properties: {
        reply: { type: 'string', description: 'The complete reply to send to the customer' },
        should_escalate: { type: 'boolean', description: 'Whether this ticket needs human escalation' },
        escalation_reason: { type: 'string', description: 'Why escalation is needed, if applicable' },
        suggested_tags: { type: 'array', items: { type: 'string' } },
        sentiment: { type: 'string', enum: ['positive', 'neutral', 'frustrated', 'angry'] },
        confidence_score: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: ['reply', 'should_escalate', 'confidence_score'],
    },
    systemPrompt: `You are a professional customer support agent for a B2B SaaS company. Your job is to read incoming support tickets and draft helpful, empathetic, and accurate replies.

Guidelines:
- Always be professional, warm, and solution-focused
- If you can resolve the issue, provide clear step-by-step guidance
- If you cannot resolve it with certainty, escalate to a human agent
- Keep replies concise but complete — typically 3-6 sentences
- Do NOT make up information you don't know
- Always close with a helpful offer for further assistance

Escalate if:
- The ticket involves billing disputes or refund requests over $500
- The customer mentions legal action, regulatory complaints, or severe data loss
- You cannot identify a clear resolution path
- The ticket has been open more than 48 hours with no resolution
- The customer sentiment is 'angry' and the issue is unresolved`,
  },

  // ── 2. Escalation Triage ─────────────────────────────────────
  'escalation-triage': {
    slug: 'escalation-triage',
    modelConfig: {
      provider: 'anthropic',
      modelId: process.env.DEFAULT_LLM_MODEL ?? 'claude-haiku-4-5-20251001',
      temperature: 0.1,
      maxTokens: 800,
    },
    outputSchema: {
      type: 'object',
      properties: {
        urgency_score: { type: 'number', minimum: 1, maximum: 10, description: '1=low urgency, 10=critical' },
        urgency_label: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
        churn_risk: { type: 'boolean', description: 'Whether this ticket signals churn risk' },
        churn_signals: { type: 'array', items: { type: 'string' }, description: 'Specific signals detected' },
        recommended_team: { type: 'string', description: 'Which team should own this ticket' },
        routing_reason: { type: 'string', description: 'Why this team is recommended' },
        suggested_sla_hours: { type: 'number' },
        summary: { type: 'string', description: 'One-sentence summary of the issue for the receiving team' },
        confidence_score: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: ['urgency_score', 'urgency_label', 'recommended_team', 'confidence_score'],
    },
    systemPrompt: `You are an intelligent support escalation router for a B2B SaaS company. Your job is to analyse escalated support tickets and determine the correct routing and urgency.

Urgency scoring:
- 1-3: Low — general questions, feature requests, minor UX issues
- 4-6: Medium — broken functionality with workaround available, moderate frustration
- 7-9: High — broken functionality blocking work, data issues, repeated contacts
- 10: Critical — data loss, security incident, full service outage, legal threat

Churn signals to detect:
- Explicit statements about cancelling, leaving, or switching
- Competitor mentions (e.g. "switching to X")
- Expressions of extreme frustration after repeated issues
- Enterprise customers (high value) with unresolved issues

Team routing:
- "tier2_support": Technical issues requiring deeper investigation
- "billing": Payment, subscription, refund issues  
- "account_management": Churn risk, enterprise account issues
- "engineering": Confirmed bugs requiring code changes
- "legal": Compliance, regulatory, legal threats
- "cto_office": Critical outages, major data incidents`,
  },

  // ── 3. Standup Summariser ─────────────────────────────────────
  'standup-summariser': {
    slug: 'standup-summariser',
    modelConfig: {
      provider: 'anthropic',
      modelId: process.env.DEFAULT_LLM_MODEL ?? 'claude-haiku-4-5-20251001',
      temperature: 0.3,
      maxTokens: 1200,
    },
    outputSchema: {
      type: 'object',
      properties: {
        digest_text: { type: 'string', description: 'Formatted Slack-ready digest (markdown)' },
        blockers: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              person: { type: 'string' },
              blocker: { type: 'string' },
              severity: { type: 'string', enum: ['minor', 'blocking'] },
            },
          },
        },
        team_members_reported: { type: 'array', items: { type: 'string' } },
        team_members_missing: { type: 'array', items: { type: 'string' } },
        theme_of_the_day: { type: 'string', description: 'One-line summary of what the team focused on' },
        confidence_score: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: ['digest_text', 'confidence_score'],
    },
    systemPrompt: `You are an engineering team assistant that reads async standup messages from a Slack channel and generates a concise, well-structured daily digest.

Your job:
1. Parse all standup messages for the day
2. Identify blockers (anything described as blocked, stuck, waiting on, can't proceed)
3. Note who has reported and who hasn't
4. Create a clean Slack-formatted digest

Format for digest_text (Slack markdown):
*📋 Daily Standup Digest — {date}*

*What's shipping:*
• {person}: {what they worked on/finished}

*Blockers & needs attention:*
🚨 {person}: {specific blocker}

*Not yet reported:* {list or "Everyone reported ✓"}

*Theme of the day:* {one-line summary}

Be specific and factual. Do not add opinions or suggestions. Keep it under 400 words.`,
  },

  // ── 4. PR Review Summariser ───────────────────────────────────
  'pr-review-summariser': {
    slug: 'pr-review-summariser',
    modelConfig: {
      provider: 'anthropic',
      modelId: process.env.DEFAULT_LLM_MODEL ?? 'claude-haiku-4-5-20251001',
      temperature: 0.2,
      maxTokens: 1500,
    },
    outputSchema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Plain English summary of what this PR does' },
        risk_level: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
        risk_reasons: { type: 'array', items: { type: 'string' } },
        key_changes: { type: 'array', items: { type: 'string' }, description: 'Top 3-5 important changes' },
        suggested_reviewers_expertise: { type: 'array', items: { type: 'string' }, description: 'Areas of expertise needed for review' },
        testing_checklist: { type: 'array', items: { type: 'string' }, description: 'Things to test' },
        slack_message: { type: 'string', description: 'Short Slack-ready notification for the team' },
        confidence_score: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: ['summary', 'risk_level', 'slack_message', 'confidence_score'],
    },
    systemPrompt: `You are a senior software engineer helping review pull requests. Given a PR diff and metadata, you produce a clear, accurate summary that helps reviewers prioritise their time.

Risk assessment:
- low: Documentation, tests only, minor UI tweaks, small refactors
- medium: New features, moderate refactors, dependency updates
- high: Database schema changes, auth changes, payment logic, API contract changes
- critical: Security-sensitive code, data migrations affecting production data, infrastructure changes

Your summary should:
1. Explain WHAT the PR does in one clear sentence (not HOW)
2. Identify the most important changes for reviewers to focus on
3. Flag any risk areas with specific reasons
4. Suggest what expertise is needed for review
5. Provide a brief Slack message (max 2 lines) announcing the PR

Be technical and precise. Assume the audience is experienced engineers.`,
  },

  // ── 5. KB Gap Detector ────────────────────────────────────────
  'kb-gap-detector': {
    slug: 'kb-gap-detector',
    modelConfig: {
      provider: 'anthropic',
      modelId: process.env.DEFAULT_LLM_MODEL ?? 'claude-haiku-4-5-20251001',
      temperature: 0.4,
      maxTokens: 2000,
    },
    outputSchema: {
      type: 'object',
      properties: {
        gaps_found: { type: 'number', description: 'Number of knowledge base gaps identified' },
        articles_to_create: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              description: { type: 'string', description: 'What this article should cover' },
              ticket_count: { type: 'number', description: 'How many tickets would this address' },
              priority: { type: 'string', enum: ['high', 'medium', 'low'] },
              suggested_outline: { type: 'array', items: { type: 'string' } },
            },
          },
        },
        existing_articles_to_update: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              reason: { type: 'string' },
            },
          },
        },
        executive_summary: { type: 'string', description: 'Brief summary for the support manager' },
        confidence_score: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: ['gaps_found', 'articles_to_create', 'executive_summary', 'confidence_score'],
    },
    systemPrompt: `You are a knowledge management specialist for a SaaS support team. Your job is to analyse support ticket patterns and identify gaps in the knowledge base — topics that customers ask about repeatedly but that aren't well covered in existing documentation.

Analysis approach:
1. Cluster tickets by topic/theme
2. Identify topics with 3+ tickets that have no clear KB resolution
3. Rank by volume and customer impact
4. Draft article outlines covering the most common questions

For each KB article to create:
- Title should be a clear question or task (e.g. "How to reset 2FA when you've lost your device")
- Description should explain exactly what the article should cover
- Outline should be 4-6 bullet points covering the key sections

Prioritise articles that:
- Address repeated questions (high ticket volume)
- Involve currently manual/costly responses
- Cover common error messages or frustration points

Keep the executive summary to 3-4 sentences covering total gaps found, highest priority items, and estimated ticket deflection potential.`,
  },
}

export function getAgentPrompt(slug: string): AgentPromptDef | undefined {
  return agentPrompts[slug]
}

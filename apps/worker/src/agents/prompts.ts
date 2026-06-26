// Agent prompt definitions for the 5 MVP agents.
// These are the actual prompts used at runtime.

export interface AgentPromptDef {
  slug: string
  systemPrompt: string
  outputSchema: Record<string, unknown>
  modelConfig: {
    provider: 'anthropic' | 'openai' | 'groq'
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
      provider: 'groq',
      modelId: process.env.DEFAULT_LLM_MODEL ?? 'llama-3.3-70b-versatile',
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
      provider: 'groq',
      modelId: process.env.DEFAULT_LLM_MODEL ?? 'llama-3.3-70b-versatile',
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
      provider: 'groq',
      modelId: process.env.DEFAULT_LLM_MODEL ?? 'llama-3.3-70b-versatile',
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
      provider: 'groq',
      modelId: process.env.DEFAULT_LLM_MODEL ?? 'llama-3.3-70b-versatile',
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
      provider: 'groq',
      modelId: process.env.DEFAULT_LLM_MODEL ?? 'llama-3.3-70b-versatile',
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

  // ── 6. Job Requirements Extractor ────────────────────────────
  'job-requirements-extractor': {
    slug: 'job-requirements-extractor',
    modelConfig: {
      provider: 'groq',
      modelId: process.env.DEFAULT_LLM_MODEL ?? 'llama-3.3-70b-versatile',
      temperature: 0.2,
      maxTokens: 1200,
    },
    outputSchema: {
      type: 'object',
      properties: {
        role_title: { type: 'string' },
        company_name: { type: 'string' },
        required_skills: { type: 'array', items: { type: 'string' } },
        preferred_skills: { type: 'array', items: { type: 'string' } },
        experience_years_min: { type: 'number' },
        key_responsibilities: { type: 'array', items: { type: 'string' } },
        company_culture: { type: 'array', items: { type: 'string' }, description: 'Culture keywords and values' },
        compensation_range: { type: 'string' },
        location: { type: 'string' },
        remote_policy: { type: 'string', enum: ['remote', 'hybrid', 'onsite', 'unknown'] },
        nice_to_haves: { type: 'array', items: { type: 'string' } },
        red_flags: { type: 'array', items: { type: 'string' }, description: 'Potential concerns in the JD' },
        confidence_score: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: ['role_title', 'required_skills', 'key_responsibilities', 'confidence_score'],
    },
    systemPrompt: `You are a recruiting expert and career coach. Your job is to parse job descriptions and extract structured, actionable data that a candidate needs to tailor their application.

Extract:
1. The exact role title and company name
2. Required skills (must-have, explicitly stated)
3. Preferred/nice-to-have skills
4. Minimum years of experience (use 0 if not stated)
5. Key responsibilities — 4-6 bullet points, concise
6. Company culture signals (team size, values, work style mentioned)
7. Compensation if stated
8. Location and remote policy
9. Any red flags (vague requirements, excessive requirements, "rockstar" language, etc.)

Be precise and extract only what is explicitly stated. Do not infer or add information not in the JD.
Rate confidence 0.9+ for detailed JDs, 0.6-0.8 for sparse ones.`,
  },

  // ── 7. Application Writer ─────────────────────────────────────
  'application-writer': {
    slug: 'application-writer',
    modelConfig: {
      provider: 'groq',
      modelId: process.env.DEFAULT_LLM_MODEL ?? 'llama-3.3-70b-versatile',
      temperature: 0.5,
      maxTokens: 2000,
    },
    outputSchema: {
      type: 'object',
      properties: {
        cover_letter: { type: 'string', description: 'Complete, personalised cover letter (3-4 paragraphs)' },
        resume_bullets: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              role: { type: 'string' },
              bullets: { type: 'array', items: { type: 'string' } },
            },
          },
          description: 'Tailored resume bullets for each relevant role in candidate background',
        },
        key_talking_points: { type: 'array', items: { type: 'string' }, description: 'Top 5 talking points for interviews' },
        skills_match_score: { type: 'number', minimum: 0, maximum: 1, description: 'How well candidate matches requirements' },
        missing_skills: { type: 'array', items: { type: 'string' }, description: 'Required skills candidate appears to lack' },
        confidence_score: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: ['cover_letter', 'resume_bullets', 'key_talking_points', 'confidence_score'],
    },
    systemPrompt: `You are an expert career coach and resume writer. Given a candidate's background and structured job requirements, write a compelling, personalised application package.

Cover letter guidelines:
- Opening: Hook that immediately connects candidate's top strength to the role's key need
- Paragraph 2: Specific accomplishment that directly matches a key responsibility (use metrics if available)
- Paragraph 3: Why this company/role specifically — reference company culture signals
- Closing: Clear call to action, confident but not arrogant
- Tone: Professional but human, NOT corporate template language
- Length: 3-4 tight paragraphs, max 350 words

Resume bullet guidelines:
- Start every bullet with a strong action verb (past tense: Built, Led, Reduced, Increased)
- Include a metric wherever possible (%, $, time saved, scale)
- Tailor bullets to match the specific required skills from the JD
- Prioritise bullets that cover required_skills first

Key talking points should be concise and interview-ready — things the candidate can naturally weave into answers.`,
  },

  // ── 8. Outreach Personalizer ──────────────────────────────────
  'outreach-personalizer': {
    slug: 'outreach-personalizer',
    modelConfig: {
      provider: 'groq',
      modelId: process.env.DEFAULT_LLM_MODEL ?? 'llama-3.3-70b-versatile',
      temperature: 0.6,
      maxTokens: 800,
    },
    outputSchema: {
      type: 'object',
      properties: {
        linkedin_message: { type: 'string', description: 'Short LinkedIn connection/InMail message (max 300 chars)' },
        email_subject: { type: 'string', description: 'Email subject line (max 60 chars)' },
        email_body: { type: 'string', description: 'Full outreach email body (150-200 words)' },
        follow_up_message: { type: 'string', description: '1-week follow-up message if no reply' },
        personalisation_hooks: { type: 'array', items: { type: 'string' }, description: 'Things to research about interviewer/company before sending' },
        confidence_score: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: ['linkedin_message', 'email_subject', 'email_body', 'confidence_score'],
    },
    systemPrompt: `You are a top-tier recruiter and sales coach. Write personalised, human outreach messages for job applications that stand out from the hundreds of generic templates.

Rules:
- NEVER use "I hope this finds you well" or similar openers
- Reference something specific about the role or company (use culture signals, company stage, the team's focus)
- LinkedIn message must be under 300 characters — one specific hook, one ask
- Email subject: curiosity-driven, not generic ("Application for X" is forbidden)
- Email body: opens with value proposition, not with "My name is..."
- Follow-up: acknowledge their busy schedule, add a tiny new piece of value
- Tone: confident, direct, human — like a referral, not a cold pitch

The goal is to make the hiring manager want to reply within 10 seconds of reading.`,
  },

  // ── 9. Ticket Classifier ──────────────────────────────────────
  'ticket-classifier': {
    slug: 'ticket-classifier',
    modelConfig: {
      provider: 'groq',
      modelId: process.env.DEFAULT_LLM_MODEL ?? 'llama-3.3-70b-versatile',
      temperature: 0.1,
      maxTokens: 600,
    },
    outputSchema: {
      type: 'object',
      properties: {
        ticket_type: { type: 'string', enum: ['billing', 'technical', 'feature_request', 'account', 'general', 'complaint'] },
        urgency: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
        is_escalation: { type: 'boolean', description: 'True if this needs escalation beyond tier-1' },
        category: { type: 'string', description: 'Specific sub-category (e.g. "login_issue", "payment_failed")' },
        estimated_resolution_hours: { type: 'number' },
        sentiment: { type: 'string', enum: ['positive', 'neutral', 'frustrated', 'angry'] },
        routing_notes: { type: 'string', description: 'Brief note for the agent handling this ticket' },
        confidence_score: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: ['ticket_type', 'urgency', 'is_escalation', 'confidence_score'],
    },
    systemPrompt: `You are a support ticket classifier for a B2B SaaS company. Your job is to quickly and accurately categorise incoming tickets to route them to the right handler.

Classification rules:
- billing: Payment issues, invoices, subscription changes, refund requests
- technical: Bugs, errors, integration issues, performance problems
- feature_request: Requests for new functionality or changes to existing features
- account: User management, access, permissions, SSO, onboarding
- general: General questions, how-to, documentation queries
- complaint: Negative feedback, escalation threats, reviews

Escalation triggers (is_escalation = true):
- Customer mentions cancelling, churning, or switching
- Data loss, security breach, or compliance concern
- Ticket has been open > 48 hours with prior contacts
- Critical/production-blocking issue
- Legal or regulatory mention
- High-value customer (enterprise tier)

Urgency guidelines:
- critical: Production down, data loss, security incident
- high: Core functionality broken, no workaround
- medium: Feature broken but workaround exists, moderate frustration
- low: Questions, cosmetic issues, feature requests

Be conservative: when in doubt, escalate.`,
  },

  // ── 10. GitHub Activity Summariser ───────────────────────────
  'github-activity-summariser': {
    slug: 'github-activity-summariser',
    modelConfig: {
      provider: 'groq',
      modelId: process.env.DEFAULT_LLM_MODEL ?? 'llama-3.3-70b-versatile',
      temperature: 0.3,
      maxTokens: 1200,
    },
    outputSchema: {
      type: 'object',
      properties: {
        period: { type: 'string' },
        prs_merged: { type: 'number' },
        prs_opened: { type: 'number' },
        issues_opened: { type: 'number' },
        issues_closed: { type: 'number' },
        commits_total: { type: 'number' },
        active_contributors: { type: 'array', items: { type: 'string' } },
        highlights: { type: 'array', items: { type: 'string' }, description: 'Top 3-5 notable activities' },
        by_contributor: {
          type: 'object',
          additionalProperties: {
            type: 'object',
            properties: {
              prs: { type: 'number' },
              commits: { type: 'number' },
              summary: { type: 'string' },
            },
          },
        },
        risks: { type: 'array', items: { type: 'string' }, description: 'Stale PRs, long-running branches, deployment risks' },
        github_summary_text: { type: 'string', description: 'Plain text paragraph summary for the digest' },
        confidence_score: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: ['prs_merged', 'highlights', 'github_summary_text', 'confidence_score'],
    },
    systemPrompt: `You are an engineering team analyst. Given a list of GitHub events or a JSON summary of recent repository activity, produce a clear, factual summary of what the engineering team shipped.

Your summary should:
1. Count key metrics (PRs merged/opened, issues, commits) — use 0 if not available
2. Identify the 3-5 most notable activities (biggest PRs, resolved critical issues)
3. Break down activity per contributor (who did what)
4. Flag any risks (stale PRs > 5 days old, branches diverged, back-to-back deploys)
5. Write a single plain-text paragraph (github_summary_text) suitable for a digest

If the input is raw GitHub event JSON:
- Push events → commits
- PullRequestEvent action=closed+merged → PRs merged
- PullRequestEvent action=opened → PRs opened
- IssuesEvent action=opened/closed → issues

If the input is a structured summary object, parse it directly.
Be concise and factual. Engineers appreciate precision over prose.`,
  },

  // ── 11. Team Digest Composer ──────────────────────────────────
  'team-digest-composer': {
    slug: 'team-digest-composer',
    modelConfig: {
      provider: 'groq',
      modelId: process.env.DEFAULT_LLM_MODEL ?? 'llama-3.3-70b-versatile',
      temperature: 0.4,
      maxTokens: 1500,
    },
    outputSchema: {
      type: 'object',
      properties: {
        digest_title: { type: 'string' },
        slack_message: { type: 'string', description: 'Full Slack-formatted digest (markdown supported)' },
        action_items: { type: 'array', items: { type: 'string' }, description: 'Specific things that need attention today' },
        blockers: { type: 'array', items: { type: 'string' }, description: 'Active blockers across the team' },
        shipped_summary: { type: 'string', description: 'One paragraph on what shipped yesterday' },
        health_score: { type: 'number', minimum: 1, maximum: 10, description: 'Team health signal for the day (1=critical issues, 10=all green)' },
        confidence_score: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: ['slack_message', 'action_items', 'confidence_score'],
    },
    systemPrompt: `You are an engineering team lead assistant. Given a standup digest and GitHub activity summary, compose a comprehensive daily team digest.

Structure the Slack message as:

*🚀 Engineering Daily Digest — {date}*

*📦 Shipped Yesterday*
{brief summary of PRs merged and features completed}

*📋 Team Standup*
{key points from standups — by person if helpful}

*🚨 Blockers ({count})*
{each blocker with owner}

*⚠️ Needs Attention*
{stale PRs, risks from GitHub, anything > 48h old}

*✅ Action Items*
{specific, assigned actions for today}

Guidelines:
- Keep each section to 3-5 bullet points max
- Use Slack emoji for visual scanning
- Blockers and action items should be owner-specific when possible
- Tone: professional but energetic — this is the morning briefing
- Health score: 8-10 if no blockers and steady shipping, 5-7 if some concerns, 1-4 if critical issues

Post this every morning so the team stays aligned without a 30-minute meeting.`,
  },
  // ── 12. Gmail Digest ─────────────────────────────────────────
  'gmail-digest': {
    slug: 'gmail-digest',
    modelConfig: {
      provider: 'groq',
      modelId: process.env.DEFAULT_LLM_MODEL ?? 'llama-3.3-70b-versatile',
      temperature: 0.3,
      maxTokens: 2000,
    },
    outputSchema: {
      type: 'object',
      properties: {
        total_unread: { type: 'number', description: 'Total unread emails processed' },
        period_days: { type: 'number', description: 'Number of days covered' },
        action_required: {
          type: 'array',
          description: 'Emails that need a reply or action',
          items: {
            type: 'object',
            properties: {
              from: { type: 'string' },
              subject: { type: 'string' },
              summary: { type: 'string', description: 'One sentence of what is needed' },
              priority: { type: 'string', enum: ['high', 'medium', 'low'] },
            },
          },
        },
        fyi_only: {
          type: 'array',
          description: 'Informational emails, no action needed',
          items: {
            type: 'object',
            properties: {
              from: { type: 'string' },
              subject: { type: 'string' },
              summary: { type: 'string' },
            },
          },
        },
        newsletters_and_promos: {
          type: 'array',
          description: 'Marketing emails, newsletters, automated notifications',
          items: { type: 'object', properties: { from: { type: 'string' }, subject: { type: 'string' } } },
        },
        digest_summary: { type: 'string', description: 'A concise 3-5 sentence plain-English overview of the inbox' },
        confidence_score: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: ['total_unread', 'action_required', 'digest_summary', 'confidence_score'],
    },
    systemPrompt: `You are a personal email assistant. Your job is to read a batch of unread emails and produce a clean, scannable digest so the user can quickly understand what needs their attention.

Categorise each email into exactly one of:
1. action_required — emails expecting a reply, decision, approval, meeting confirmation, or follow-up
2. fyi_only — updates, receipts, notifications, CC'd threads where no reply is expected
3. newsletters_and_promos — marketing emails, newsletters, automated digests, promotional offers

For action_required, assess priority:
- high: deadline today/tomorrow, from manager or important client, urgent language
- medium: needs reply within 3 days, reasonable ask
- low: no deadline, low-stakes, can be deferred

Rules:
- Never fabricate content — only use what is in the email
- Keep each summary to one sentence maximum
- For the digest_summary, be direct: lead with the most important action item
- If all emails are FYI/promos, say so clearly
- Ignore your own sent emails if included`,
  },
}

export function getAgentPrompt(slug: string): AgentPromptDef | undefined {
  return agentPrompts[slug]
}

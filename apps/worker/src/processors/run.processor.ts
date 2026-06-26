import { Worker } from 'bullmq'
import { db, runs, deployments, agentVersions, agents, workspaceSecrets } from '@runlet/db'
import { eq, and, gte, sql } from 'drizzle-orm'
import { getRedis, QUEUE_NAMES, notifyQueue } from '@runlet/queue'
import type { RunJob } from '@runlet/queue'
import { storePayload, getPayload } from '@runlet/storage'
import { generateId, hashPayload, decrypt } from '@runlet/utils'
import { runGuardrails, maskPii } from '../engine/guardrail.engine'
import { executeLLM, calculateLLMCost } from '../engine/llm.executor'
import { writeAuditEvent, resolveCredentials } from '../engine/audit.writer'
import { executeConnectorAction } from '@runlet/connectors'
import { getAgentPrompt } from '../agents/prompts'

// ── Process a single run job ────────────────────────────────────
async function processRunJob(job: { data: RunJob }): Promise<void> {
  const { runId, workspaceId, deploymentId, inputPayload, triggerType, depth } = job.data
  const startTime = Date.now()

  console.log(`[Worker] Processing run ${runId}`)

  // T2 — Mark as running
  await db.update(runs).set({ status: 'running', startedAt: new Date() }).where(eq(runs.id, runId))
  await writeAuditEvent({ runId, workspaceId, eventType: 'run_started', actor: { type: 'system' } })

  try {
    // ── Load deployment + version ────────────────────────────────
    const deployment = await db.query.deployments.findFirst({
      where: and(eq(deployments.id, deploymentId), eq(deployments.workspaceId, workspaceId)),
    })
    if (!deployment) throw new Error(`Deployment not found: ${deploymentId}`)

    const version = await db.query.agentVersions.findFirst({
      where: eq(agentVersions.id, deployment.agentVersionId),
    })
    if (!version) throw new Error(`Agent version not found: ${deployment.agentVersionId}`)

    const agent = await db.query.agents.findFirst({ where: eq(agents.id, deployment.agentId) })
    if (!agent) throw new Error(`Agent not found: ${deployment.agentId}`)

    // Decrypt deployment config
    const configEncKey = process.env.CONFIG_ENCRYPTION_KEY!
    const deployConfig = deployment.encryptedConfig
      ? JSON.parse(decrypt(deployment.encryptedConfig, configEncKey)) as Record<string, unknown>
      : {}

    const guardrailOverrides = deployment.guardrailOverrides as Record<string, unknown> | undefined
    const confidenceThreshold = (guardrailOverrides?.confidenceThreshold as number) ?? 0.65
    const maxRunsPerHour = deployment.maxRunsPerHour

    // ── T3 — Pre-LLM Guardrails ──────────────────────────────────
    const inputText = JSON.stringify(inputPayload)

    // Check rate limit
    const [{ runCount }] = await db.select({
      runCount: sql<number>`count(*)`,
    }).from(runs).where(
      and(
        eq(runs.deploymentId, deploymentId),
        eq(runs.workspaceId, workspaceId),
        gte(runs.createdAt, new Date(Date.now() - 3600_000))
      )
    )

    const topicBlocklist = (guardrailOverrides?.topicBlocklist as string[]) ?? []
    const guardrailRules = version.guardrailRules ?? []

    // Augment guardrail rules with deployment overrides
    const effectiveRules = [
      ...guardrailRules,
      ...(topicBlocklist.length > 0 ? [{
        type: 'topic_block' as const,
        severity: 'block' as const,
        config: { topics: topicBlocklist },
      }] : []),
    ]

    const preGuardrailResult = await runGuardrails(effectiveRules, {
      input: inputPayload,
      inputText,
      workspaceId,
      deploymentId,
      runsLastHour: Number(runCount),
      maxRunsPerHour,
    }, 'pre')

    await writeAuditEvent({
      runId, workspaceId,
      eventType: 'guardrail_evaluated',
      guardrailResults: preGuardrailResult.results,
      metadata: { phase: 'pre', passed: preGuardrailResult.passed },
    })

    if (!preGuardrailResult.passed) {
      await db.update(runs).set({
        status: 'guardrail_blocked',
        completedAt: new Date(),
        durationMs: Date.now() - startTime,
        guardrailResults: preGuardrailResult.results,
        errorMessage: `Blocked by guardrail: ${preGuardrailResult.blockedBy}`,
      }).where(eq(runs.id, runId))
      await writeAuditEvent({ runId, workspaceId, eventType: 'run_failed', metadata: { reason: 'guardrail_blocked' } })
      return
    }

    // ── T4 — Resolve credentials ──────────────────────────────────
    const connectorCreds: Record<string, Record<string, unknown>> = {}
    for (const binding of deployment.connectorBindings) {
      try {
        const creds = await resolveCredentials(binding.connectorId, workspaceId)
        connectorCreds[binding.connectorRef] = creds as Record<string, unknown>
      } catch (err) {
        console.warn(`[Worker] Could not resolve credentials for ${binding.connectorRef}:`, err)
      }
    }

    // ── T5 — Build prompt + LLM call ─────────────────────────────
    // Get prompt — prefer seeded prompts, fall back to DB
    const agentPromptDef = getAgentPrompt(agent.slug)
    const promptBody = agentPromptDef?.systemPrompt ?? version.promptBody ?? ''
    const modelConfig = agentPromptDef?.modelConfig ?? version.modelConfig
    const outputSchema = agentPromptDef?.outputSchema ?? version.outputSchema

    // Resolve workspace-stored API key for the LLM provider (falls back to env var if not set)
    const providerKeyName: Record<string, string> = {
      anthropic: 'ANTHROPIC_API_KEY',
      openai: 'OPENAI_API_KEY',
      groq: 'GROQ_API_KEY',
      gemini: 'GEMINI_API_KEY',
    }
    const keyName = providerKeyName[modelConfig.provider]
    let workspaceApiKey: string | undefined
    if (keyName) {
      const secretRow = await db.query.workspaceSecrets.findFirst({
        where: and(
          eq(workspaceSecrets.workspaceId, workspaceId),
          eq(workspaceSecrets.keyName, keyName)
        ),
      })
      if (secretRow?.encryptedValue) {
        try {
          workspaceApiKey = decrypt(secretRow.encryptedValue, configEncKey)
        } catch {
          console.warn(`[Worker] Failed to decrypt workspace API key ${keyName}, falling back to env var`)
        }
      }
    }

    // For data-fetching agents, pull external data before the LLM call
    const enrichedPayload = await fetchExternalData(agent.slug, inputPayload, connectorCreds)

    // Apply PII masking if configured
    const piiPolicy = guardrailOverrides?.piiHandlingPolicy as string ?? 'mask_in_logs'
    const processedInputText = piiPolicy === 'redact_before_llm' ? maskPii(JSON.stringify(enrichedPayload)) : JSON.stringify(enrichedPayload)

    // Build context-rich user message
    const userMessage = buildUserMessage(agent.slug, enrichedPayload, deployConfig, processedInputText)

    const llmResult = await executeLLM({
      systemPrompt: promptBody,
      userMessage,
      modelConfig: modelConfig as Parameters<typeof executeLLM>[0]['modelConfig'],
      outputSchema,
      apiKey: workspaceApiKey,
    })

    const llmCost = calculateLLMCost(
      modelConfig.provider,
      llmResult.modelId,
      llmResult.promptTokens,
      llmResult.completionTokens
    )

    await writeAuditEvent({
      runId, workspaceId,
      eventType: 'llm_called',
      llmMetadata: {
        modelId: llmResult.modelId,
        provider: modelConfig.provider,
        promptTokens: llmResult.promptTokens,
        completionTokens: llmResult.completionTokens,
        latencyMs: llmResult.latencyMs,
        confidenceScore: llmResult.confidenceScore,
      },
    })

    // ── T6 — Confidence gate ──────────────────────────────────────
    if (llmResult.confidenceScore < confidenceThreshold) {
      const fallback = guardrailOverrides?.fallbackBehaviour as string ?? 'return_error'

      if (fallback === 'escalate_to_human') {
        // Store the proposed output for human review
        const outputRef = await storePayload(runId, 'output', llmResult.structuredOutput ?? {})
        await db.update(runs).set({
          status: 'pending_review',
          outputPayloadRef: outputRef,
          confidenceScore: llmResult.confidenceScore,
          llmTokensUsed: llmResult.promptTokens + llmResult.completionTokens,
          llmCostUsd: llmCost,
        }).where(eq(runs.id, runId))
        await writeAuditEvent({
          runId, workspaceId,
          eventType: 'human_review_requested',
          metadata: { confidenceScore: llmResult.confidenceScore, threshold: confidenceThreshold },
        })
        return
      }
    }

    // ── T7 — Execute actions ──────────────────────────────────────
    const output = llmResult.structuredOutput ?? { raw: llmResult.content }
    const actionResults: Array<{ action: string; success: boolean; latencyMs?: number }> = []

    // Execute agent-specific connector actions
    const actionsToExecute = buildActionsFromOutput(agent.slug, output, enrichedPayload, connectorCreds, deployConfig)

    for (const action of actionsToExecute) {
      try {
        const result = await executeConnectorAction(
          action.provider,
          action.action,
          action.credentials as Parameters<typeof executeConnectorAction>[2],
          action.input
        )
        actionResults.push({ action: `${action.provider}.${action.action}`, success: result.success, latencyMs: result.latencyMs })
        await writeAuditEvent({
          runId, workspaceId,
          eventType: 'action_executed',
          connectorCall: {
            provider: action.provider,
            actionPrimitive: action.action,
            responseStatus: result.success ? 200 : 500,
            latencyMs: result.latencyMs ?? 0,
          },
        })
      } catch (err) {
        console.error(`[Worker] Action failed ${action.provider}.${action.action}:`, err)
        actionResults.push({ action: `${action.provider}.${action.action}`, success: false })
      }
    }

    // ── T8 — Post-execution ────────────────────────────────────────
    const finalOutput = { ...output, _meta: { actionResults, runId } }
    const outputRef = await storePayload(runId, 'output', finalOutput)

    // ── T9 — Complete ─────────────────────────────────────────────
    await db.update(runs).set({
      status: 'success',
      outputPayloadRef: outputRef,
      completedAt: new Date(),
      durationMs: Date.now() - startTime,
      llmTokensUsed: llmResult.promptTokens + llmResult.completionTokens,
      llmCostUsd: llmCost,
      confidenceScore: llmResult.confidenceScore,
      guardrailResults: preGuardrailResult.results,
    }).where(eq(runs.id, runId))

    // Update deployment stats
    await db.update(deployments).set({
      runCount: sql`${deployments.runCount} + 1`,
      lastRunAt: new Date(),
    }).where(eq(deployments.id, deploymentId))

    await writeAuditEvent({
      runId, workspaceId,
      eventType: 'run_completed',
      payloadHash: hashPayload(finalOutput),
      metadata: { durationMs: Date.now() - startTime, actionCount: actionsToExecute.length },
    })

    // ── T9+ — Notify alert channels ───────────────────────────────
    const successChannels = (deployment.alertChannels ?? []).filter(ch =>
      ch.events?.includes('run_completed') || ch.events?.includes('run_success')
    )
    if (successChannels.length > 0) {
      const nq = notifyQueue()
      await nq.add('notify', {
        workspaceId,
        type: 'run_success',
        runId,
        channels: successChannels,
        payload: { message: `Run completed successfully in ${Date.now() - startTime}ms` },
      })
    }

    console.log(`[Worker] Run ${runId} completed in ${Date.now() - startTime}ms`)

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    console.error(`[Worker] Run ${runId} failed:`, errorMessage)

    await db.update(runs).set({
      status: 'failed',
      completedAt: new Date(),
      durationMs: Date.now() - startTime,
      errorMessage,
    }).where(eq(runs.id, runId))

    await writeAuditEvent({
      runId, workspaceId,
      eventType: 'run_failed',
      metadata: { error: errorMessage },
    })

    // Notify failure alert channels
    try {
      const dep = await db.query.deployments.findFirst({
        where: and(eq(deployments.id, deploymentId), eq(deployments.workspaceId, workspaceId)),
      })
      const failChannels = (dep?.alertChannels ?? []).filter(ch =>
        ch.events?.includes('run_failed')
      )
      if (failChannels.length > 0) {
        const nq = notifyQueue()
        await nq.add('notify', {
          workspaceId,
          type: 'run_failed',
          runId,
          channels: failChannels,
          payload: { message: `Run failed: ${errorMessage}` },
        })
      }
    } catch (notifyErr) {
      console.error('[Worker] Failed to enqueue failure notification:', notifyErr)
    }

    throw err // BullMQ will retry based on job options
  }
}

// ── Build user message per agent slug ─────────────────────────
function buildUserMessage(
  slug: string,
  input: Record<string, unknown>,
  config: Record<string, unknown>,
  inputText: string
): string {
  switch (slug) {
    case 'tier-1-reply':
      return `<ticket>
Subject: ${input.subject ?? 'No subject'}
Channel: ${input.channel ?? 'email'}
Priority: ${input.priority ?? 'normal'}
Customer: ${input.requester_name ?? 'Customer'}

${input.description ?? input.body ?? inputText}
</ticket>

${config.company_name ? `Company: ${config.company_name}` : ''}
${config.product_name ? `Product: ${config.product_name}` : ''}
${config.tone ? `Response tone: ${config.tone}` : ''}

Draft a helpful reply to this support ticket.`

    case 'escalation-triage':
      return `<escalated_ticket>
Ticket ID: ${input.ticket_id ?? 'Unknown'}
Subject: ${input.subject ?? 'No subject'}
Previous replies: ${input.comment_count ?? 0}
Current status: ${input.status ?? 'open'}

${input.description ?? input.body ?? inputText}
</escalated_ticket>

Analyse this ticket for urgency, churn risk, and correct team routing.`

    case 'standup-summariser':
      return `<standup_messages>
Date: ${new Date().toDateString()}
Channel: ${input.channel ?? '#standup'}
Team size: ${(input.team_members as string[])?.length ?? 'unknown'}

${JSON.stringify(input.messages ?? inputText, null, 2)}
</standup_messages>

Expected team members: ${JSON.stringify(input.team_members ?? [])}

Generate the standup digest.`

    case 'pr-review-summariser':
      return `<pull_request>
Repository: ${input.repo ?? 'Unknown'}
PR #${input.number ?? 'Unknown'}: ${input.title ?? 'Unknown'}
Author: ${input.author ?? 'Unknown'}
Base branch: ${input.base ?? 'main'}
Files changed: ${input.files_changed ?? 'Unknown'}
Additions: ${input.additions ?? 0}, Deletions: ${input.deletions ?? 0}

Description:
${input.body ?? 'No description provided'}

Files changed:
${JSON.stringify(input.files ?? [], null, 2)}

Diff (truncated to 3000 chars):
${String(input.diff ?? '').slice(0, 3000)}
</pull_request>

Summarise this pull request for the team.`

    case 'kb-gap-detector':
      return `<tickets_analysis>
Period: ${input.period ?? 'Last 7 days'}
Total tickets analysed: ${(input.tickets as unknown[])?.length ?? 0}
No-match tickets: ${input.no_match_count ?? 0}

Ticket data:
${JSON.stringify(input.tickets ?? [], null, 2)}

Existing KB articles (titles only):
${JSON.stringify(input.existing_articles ?? [], null, 2)}
</tickets_analysis>

Identify knowledge base gaps and draft article outlines.`

    case 'job-requirements-extractor':
      return `<job_description>
${input.job_description ?? input.description ?? inputText}
</job_description>

${input.company_name ? `Company: ${input.company_name}` : ''}
${input.candidate_name ? `Candidate: ${input.candidate_name}` : ''}

Extract structured job requirements from this job description.`

    case 'application-writer': {
      const reqs = input.required_skills ?? input.requirements ?? {}
      const background = input.candidate_background ?? input.background ?? inputText
      return `<job_requirements>
${JSON.stringify(reqs, null, 2)}
</job_requirements>

<candidate_background>
Name: ${input.candidate_name ?? 'The candidate'}
${background}
</candidate_background>

${input.role_title ? `Role: ${input.role_title}` : ''}
${input.company_name ? `Company: ${input.company_name}` : ''}

Write a tailored cover letter, resume bullets, and talking points for this application.`
    }

    case 'outreach-personalizer': {
      const talkingPoints = input.key_talking_points ?? input.talking_points ?? []
      return `<application_context>
Role: ${input.role_title ?? 'the role'}
Company: ${input.company_name ?? 'the company'}
Candidate: ${input.candidate_name ?? 'the candidate'}
Skills match score: ${input.skills_match_score ?? 'unknown'}

Key talking points:
${(talkingPoints as string[]).map((p, i) => `${i + 1}. ${p}`).join('\n')}

Cover letter excerpt (for tone matching):
${String(input.cover_letter ?? '').slice(0, 300)}
</application_context>

Write personalised outreach messages (LinkedIn + email) for this job application.`
    }

    case 'ticket-classifier':
      return `<support_ticket>
Ticket ID: ${input.ticket_id ?? 'Unknown'}
Subject: ${input.subject ?? 'No subject'}
Customer tier: ${input.customer_tier ?? 'standard'}
Previous contacts: ${input.previous_contacts ?? 0}

${input.description ?? input.body ?? inputText}
</support_ticket>

Classify this ticket and determine routing.`

    case 'standup-summarizer':
    case 'standup-summariser':
      return `<standup_messages>
Date: ${input.date ?? new Date().toDateString()}
Channel: ${input.channel ?? '#standup'}
Team size: ${(input.team_members as string[])?.length ?? 'unknown'}

${JSON.stringify(input.messages ?? input.standup_messages ?? inputText, null, 2)}
</standup_messages>

Expected team members: ${JSON.stringify(input.team_members ?? [])}

Generate the standup digest.`

    case 'github-activity-summariser':
      return `<github_activity>
Repository/Team: ${input.repo ?? input.team_name ?? 'Unknown'}
Period: ${input.period ?? 'Last 24 hours'}
Date: ${input.date ?? new Date().toDateString()}

Events/Activity:
${JSON.stringify(input.github_events ?? input.events ?? input.github_events_json ?? [], null, 2).slice(0, 4000)}
</github_activity>

Summarise the engineering team's GitHub activity for the digest.`

    case 'team-digest-composer':
      return `<digest_inputs>
Date: ${input.date ?? new Date().toDateString()}
Team: ${input.team_name ?? 'Engineering'}

GitHub Activity Summary:
${JSON.stringify(input.github_summary ?? input.github_summary_text ?? {}, null, 2)}

Standup Digest:
${input.standup_digest ?? input.digest_text ?? JSON.stringify(input.standup_summary ?? {}, null, 2)}

Active Blockers:
${JSON.stringify(input.blockers ?? [], null, 2)}
</digest_inputs>

Compose the complete daily engineering digest.`

    case 'gmail-digest': {
      const emails = input.emails as Array<Record<string, unknown>> ?? []
      const days = input.days ?? 7
      if (emails.length === 0) {
        return `No unread emails found in the last ${days} days. Return a digest_summary stating the inbox is clear.`
      }
      const emailList = emails.map((e, i) =>
        `--- Email ${i + 1} ---\nFrom: ${e.from}\nSubject: ${e.subject}\nDate: ${e.date}\nSnippet: ${e.snippet}\n\nBody:\n${e.body}`
      ).join('\n\n')
      return `Summarise these ${emails.length} unread emails from the last ${days} days:\n\n${emailList}`
    }

    default:
      return `Input data:\n${inputText}`
  }
}

// ── Pre-LLM data fetching for data-pull agents ─────────────────
async function fetchExternalData(
  slug: string,
  input: Record<string, unknown>,
  creds: Record<string, Record<string, unknown>>
): Promise<Record<string, unknown>> {
  if (slug === 'gmail-digest') {
    const gmailCreds = creds['gmail'] ?? {}
    if (!gmailCreds.accessToken) {
      console.warn('[Worker] gmail-digest: no Gmail credentials, running on empty input')
      return { ...input, emails: [], emails_fetched: 0 }
    }

    const days = (input.days as number) ?? 7
    const maxMessages = Math.min((input.max_messages as number) ?? 20, 50)

    console.log(`[Worker] gmail-digest: fetching up to ${maxMessages} unread emails from last ${days} days`)

    const listResult = await executeConnectorAction('gmail', 'messages.list', gmailCreds, { days, maxResults: maxMessages })
    if (!listResult.success || !listResult.data) {
      console.warn('[Worker] gmail-digest: failed to list messages:', listResult.error)
      return { ...input, emails: [], emails_fetched: 0 }
    }

    const messageIds = (listResult.data as Array<{ id: string }>).map(m => m.id)
    const emails: unknown[] = []

    for (const msgId of messageIds) {
      const msgResult = await executeConnectorAction('gmail', 'messages.get', gmailCreds, { messageId: msgId })
      if (msgResult.success && msgResult.data) emails.push(msgResult.data)
    }

    console.log(`[Worker] gmail-digest: fetched ${emails.length} emails`)
    return { ...input, emails, emails_fetched: emails.length, days }
  }

  // All other agents: pass through unchanged
  return input
}

// ── Build actions from LLM output ──────────────────────────────
interface ActionToExecute {
  provider: string
  action: string
  credentials: Record<string, unknown>
  input: Record<string, unknown>
}

function buildActionsFromOutput(
  slug: string,
  output: Record<string, unknown>,
  input: Record<string, unknown>,
  creds: Record<string, Record<string, unknown>>,
  config: Record<string, unknown>
): ActionToExecute[] {
  const actions: ActionToExecute[] = []
  const zendeskCreds = creds['zendesk'] ?? {}
  const slackCreds = creds['slack'] ?? {}
  const notionCreds = creds['notion'] ?? {}

  switch (slug) {
    case 'tier-1-reply': {
      const ticketId = input.ticket_id ?? input.id
      const shouldEscalate = output.should_escalate === true
      const reply = output.reply as string
      const confidence = output.confidence_score as number ?? 0

      // Post reply to Zendesk if we have credentials and a ticket ID
      if (ticketId && zendeskCreds.accessToken && reply && confidence >= 0.65) {
        actions.push({
          provider: 'zendesk',
          action: 'tickets.comment',
          credentials: zendeskCreds,
          input: {
            ticketId,
            body: reply,
            isPublic: !shouldEscalate,
          },
        })

        // Update ticket tags
        if (output.suggested_tags) {
          actions.push({
            provider: 'zendesk',
            action: 'tickets.update',
            credentials: zendeskCreds,
            input: {
              ticketId,
              tags: output.suggested_tags as string[],
              status: shouldEscalate ? 'open' : 'pending',
            },
          })
        }
      }
      break
    }

    case 'escalation-triage': {
      const ticketId = input.ticket_id ?? input.id
      const urgencyLabel = output.urgency_label as string
      const team = output.recommended_team as string

      // Update ticket priority in Zendesk
      if (ticketId && zendeskCreds.accessToken) {
        const priorityMap: Record<string, string> = {
          low: 'low', medium: 'normal', high: 'high', critical: 'urgent',
        }
        actions.push({
          provider: 'zendesk',
          action: 'tickets.update',
          credentials: zendeskCreds,
          input: {
            ticketId,
            priority: priorityMap[urgencyLabel] ?? 'normal',
          },
        })
      }

      // Notify Slack if high/critical
      const slackChannel = config.escalation_slack_channel as string ?? '#support-escalations'
      if (['high', 'critical'].includes(urgencyLabel) && slackCreds.accessToken) {
        actions.push({
          provider: 'slack',
          action: 'messages.post',
          credentials: slackCreds,
          input: {
            channel: slackChannel,
            text: `🚨 *${urgencyLabel.toUpperCase()} Urgency* — ${output.summary}\n→ Routed to: ${team}\n${output.churn_risk ? '⚠️ *Churn Risk Detected*' : ''}`,
          },
        })
      }
      break
    }

    case 'standup-summariser':
    case 'standup-summarizer': {
      const digestChannel = (input.digest_channel as string) ?? (config.digest_channel as string) ?? '#standup-digest'
      if (slackCreds.accessToken && output.digest_text) {
        actions.push({
          provider: 'slack',
          action: 'messages.post',
          credentials: slackCreds,
          input: {
            channel: digestChannel,
            text: output.digest_text as string,
          },
        })
      }
      break
    }

    case 'pr-review-summariser': {
      const notifyChannel = (config.notify_channel as string) ?? '#engineering'
      if (slackCreds.accessToken && output.slack_message) {
        actions.push({
          provider: 'slack',
          action: 'messages.post',
          credentials: slackCreds,
          input: {
            channel: notifyChannel,
            text: `${output.slack_message}\n_Risk: ${output.risk_level} | ${output.key_changes ? (output.key_changes as string[]).length + ' key changes' : ''}_`,
          },
        })
      }
      break
    }

    case 'kb-gap-detector': {
      const notionDbId = config.notion_database_id as string
      if (notionCreds.accessToken && notionDbId && output.articles_to_create) {
        const articles = output.articles_to_create as Array<{ title: string; description: string }>
        actions.push({
          provider: 'notion',
          action: 'pages.create',
          credentials: notionCreds,
          input: {
            parentDatabaseId: notionDbId,
            title: `KB Gap Report — ${new Date().toLocaleDateString()}`,
            content: `# KB Gap Analysis\n\n${output.executive_summary}\n\n## Articles to Create\n\n${articles.map(a => `### ${a.title}\n${a.description}`).join('\n\n')}`,
          },
        })
      }
      break
    }

    case 'team-digest-composer': {
      const digestChannel = (config.digest_channel as string) ?? (input.digest_channel as string) ?? '#engineering'
      if (slackCreds.accessToken && output.slack_message) {
        actions.push({
          provider: 'slack',
          action: 'messages.post',
          credentials: slackCreds,
          input: {
            channel: digestChannel,
            text: output.slack_message as string,
          },
        })
      }
      break
    }

    case 'application-writer': {
      const notionDbId = config.notion_database_id as string
      if (notionCreds.accessToken && notionDbId && output.cover_letter) {
        actions.push({
          provider: 'notion',
          action: 'pages.create',
          credentials: notionCreds,
          input: {
            parentDatabaseId: notionDbId,
            title: `Application — ${input.role_title ?? 'New Role'} at ${input.company_name ?? 'Company'}`,
            content: `# Cover Letter\n\n${output.cover_letter}\n\n# Resume Bullets\n\n${JSON.stringify(output.resume_bullets, null, 2)}\n\n# Talking Points\n\n${(output.key_talking_points as string[] ?? []).map((p, i) => `${i + 1}. ${p}`).join('\n')}`,
          },
        })
      }
      break
    }
  }

  return actions
}

// ── Create workers ────────────────────────────────────────────
export function createRunWorkers() {
  const workerOptions = {
    connection: getRedis(),
    concurrency: 5,
  }

  const workers = [
    QUEUE_NAMES.RUN_REALTIME,
    QUEUE_NAMES.RUN_STANDARD,
    QUEUE_NAMES.RUN_BATCH,
  ].map(queueName => new Worker<RunJob>(queueName, processRunJob, {
    ...workerOptions,
    concurrency: queueName === QUEUE_NAMES.RUN_REALTIME ? 10 : 5,
  }))

  workers.forEach(w => {
    w.on('failed', (job, err) => {
      console.error(`[Worker] Job failed in ${w.name}:`, job?.id, err.message)
    })
    w.on('completed', (job) => {
      console.log(`[Worker] Job completed in ${w.name}:`, job.id)
    })
  })

  return workers
}

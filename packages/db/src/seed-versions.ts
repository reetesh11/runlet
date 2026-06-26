import postgres from 'postgres'

async function seedVersions() {
  const url = process.env.DATABASE_URL
  if (!url) { console.error('DATABASE_URL not set'); process.exit(1) }

  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} })

  const agents = await sql.unsafe(`SELECT id, slug FROM agents`) as Array<{ id: string; slug: string }>

  const connectorMap: Record<string, Array<{ provider: string; scopes: string[]; optional: boolean }>> = {
    'tier-1-reply': [{ provider: 'zendesk', scopes: ['tickets:read', 'tickets:write'], optional: true }],
    'escalation-triage': [
      { provider: 'zendesk', scopes: ['tickets:read', 'tickets:write'], optional: true },
      { provider: 'slack', scopes: ['chat:write'], optional: true }
    ],
    'standup-summariser': [{ provider: 'slack', scopes: ['channels:history', 'chat:write'], optional: true }],
    'standup-summarizer': [{ provider: 'slack', scopes: ['channels:history', 'chat:write'], optional: true }],
    'pr-review-summariser': [
      { provider: 'github', scopes: ['repo'], optional: true },
      { provider: 'slack', scopes: ['chat:write'], optional: true }
    ],
    'kb-gap-detector': [
      { provider: 'zendesk', scopes: ['tickets:read'], optional: true },
      { provider: 'notion', scopes: ['pages:write'], optional: true }
    ],
    'job-requirements-extractor': [],
    'application-writer': [{ provider: 'notion', scopes: ['pages:write'], optional: true }],
    'outreach-personalizer': [],
    'ticket-classifier': [],
    'gmail-digest': [{ provider: 'gmail', scopes: ['https://www.googleapis.com/auth/gmail.readonly'], optional: false }],
    'github-activity-summariser': [{ provider: 'github', scopes: ['repo:read'], optional: true }],
    'team-digest-composer': [{ provider: 'slack', scopes: ['chat:write'], optional: true }],
  }

  for (const agent of agents) {
    const versionId = `ver_${agent.id.slice(4)}_v1`
    const connectors = JSON.stringify(connectorMap[agent.slug] ?? [])
    const modelConfig = JSON.stringify({ provider: 'groq', modelId: 'llama-3.3-70b-versatile', temperature: 0.3, maxTokens: 1000 })
    const inputSchema = JSON.stringify({ type: 'object', properties: { subject: { type: 'string', description: 'Subject or title' }, description: { type: 'string', description: 'Full description or body' }, ticket_id: { type: 'string', description: 'Source ticket ID (optional)' } } })
    const outputSchema = JSON.stringify({ type: 'object', properties: { reply: { type: 'string' }, confidence_score: { type: 'number' }, should_escalate: { type: 'boolean' } } })
    const guardrails = JSON.stringify([{ type: 'pii_mask', severity: 'warn', config: { policy: 'mask_in_logs' } }, { type: 'confidence_gate', severity: 'warn', config: { threshold: 0.65 } }])
    const versionHash = `seed_${agent.slug}_v1`

    await sql.unsafe(`INSERT INTO agent_versions (id, agent_id, semver, prompt_body, model_config, input_schema, output_schema, required_connectors, guardrail_rules, timeout_seconds, status, version_hash) VALUES ('${versionId}', '${agent.id}', '1.0.0', 'You are a helpful AI assistant for ${agent.slug}.', '${modelConfig}', '${inputSchema}', '${outputSchema}', '${connectors}', '${guardrails}', 60, 'published', '${versionHash}') ON CONFLICT (id) DO NOTHING`)

    await sql.unsafe(`UPDATE agents SET latest_published_version_id = '${versionId}' WHERE id = '${agent.id}'`)

    console.log(`✅ Seeded version for: ${agent.slug}`)
  }

  console.log('\n✅ Version seed complete')
  await sql.end()
  process.exit(0)
}

seedVersions().catch(err => { console.error('Seed versions failed:', err.message); process.exit(1) })

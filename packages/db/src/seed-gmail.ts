import postgres from 'postgres'

async function seedGmail() {
  const url = process.env.DATABASE_URL
  if (!url) { console.error('DATABASE_URL not set'); process.exit(1) }
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} })

  const SEED_USER_ID = 'user_seed_001'
  const agentId = 'agt_gmail_digest_001'

  // Insert gmail-digest agent
  await sql.unsafe(`
    INSERT INTO agents (id, slug, display_name, tagline, vertical, category, status, visibility, licence, author_id)
    VALUES (
      '${agentId}',
      'gmail-digest',
      'Gmail Digest',
      'Summarise your unread Gmail emails into a concise daily digest',
      'operations',
      'Communication',
      'published'::agent_status,
      'public'::agent_visibility,
      'runlet_open'::agent_licence,
      '${SEED_USER_ID}'
    )
    ON CONFLICT (slug) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      tagline = EXCLUDED.tagline,
      status = EXCLUDED.status
    RETURNING id, slug
  `)

  // Get the actual agent ID (may differ if it already existed)
  const existing = await sql.unsafe(`SELECT id FROM agents WHERE slug = 'gmail-digest'`) as Array<{ id: string }>
  const resolvedId = existing[0]?.id ?? agentId

  const versionId = `ver_${resolvedId.slice(4)}_v1`
  const modelConfig = JSON.stringify({ provider: 'groq', modelId: 'llama-3.3-70b-versatile', temperature: 0.3, maxTokens: 1500 })
  const inputSchema = JSON.stringify({
    type: 'object',
    properties: {
      days: { type: 'number', description: 'How many days back to look (default: 7)' },
      max_messages: { type: 'number', description: 'Maximum emails to fetch (default: 10, max: 20)' },
    },
  })
  const outputSchema = JSON.stringify({
    type: 'object',
    properties: {
      digest_summary: { type: 'string', description: 'Overall digest of the inbox' },
      email_summaries: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            from: { type: 'string' },
            subject: { type: 'string' },
            summary: { type: 'string' },
            importance: { type: 'string', enum: ['high', 'medium', 'low'] },
          },
        },
      },
      total_emails: { type: 'number' },
      days_covered: { type: 'number' },
      confidence_score: { type: 'number' },
    },
  })
  const requiredConnectors = JSON.stringify([
    { provider: 'gmail', scopes: ['https://www.googleapis.com/auth/gmail.readonly'], optional: false },
  ])
  const guardrails = JSON.stringify([
    { type: 'confidence_gate', severity: 'warn', config: { threshold: 0.65 } },
  ])

  await sql.unsafe(`
    INSERT INTO agent_versions (
      id, agent_id, semver, prompt_body, model_config,
      input_schema, output_schema, required_connectors,
      guardrail_rules, timeout_seconds, status, version_hash
    ) VALUES (
      '${versionId}',
      '${resolvedId}',
      '1.0.0',
      'You are a Gmail Digest agent.',
      '${modelConfig.replace(/'/g, "''")}',
      '${inputSchema.replace(/'/g, "''")}',
      '${outputSchema.replace(/'/g, "''")}',
      '${requiredConnectors.replace(/'/g, "''")}',
      '${guardrails.replace(/'/g, "''")}',
      120,
      'published',
      'seed_gmail_digest_v1'
    )
    ON CONFLICT (id) DO NOTHING
  `)

  await sql.unsafe(`
    UPDATE agents SET latest_published_version_id = '${versionId}'
    WHERE id = '${resolvedId}'
  `)

  // Also install it in the seed workspace
  const SEED_WORKSPACE_ID = 'ws_seed_001'
  await sql.unsafe(`
    INSERT INTO workspace_agents (id, workspace_id, agent_id, pinned_version_id, installed_by)
    SELECT
      'wa_gmail_' || '${resolvedId}',
      '${SEED_WORKSPACE_ID}',
      '${resolvedId}',
      '${versionId}',
      '${SEED_USER_ID}'
    WHERE NOT EXISTS (
      SELECT 1 FROM workspace_agents
      WHERE workspace_id = '${SEED_WORKSPACE_ID}' AND agent_id = '${resolvedId}'
    )
  `)

  console.log(`✅ Gmail Digest agent seeded (id: ${resolvedId})`)
  await sql.end()
  process.exit(0)
}

seedGmail().catch(err => { console.error('Failed:', err.message); process.exit(1) })

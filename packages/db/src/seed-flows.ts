import postgres from 'postgres'

const SEED_USER_ID = 'user_seed_001'
const SEED_WORKSPACE_ID = 'ws_seed_001'

function esc(val: string): string {
  return val.replace(/'/g, "''")
}

const FLOW_DEFS = [
  // ── Flow 1: Job Application Pipeline ────────────────────────────
  {
    id: 'flo_seed_job_app',
    name: 'Job Application Pipeline',
    description: 'Paste a job description and your background — get a tailored cover letter, resume bullets, and personalised outreach messages in one automated pipeline.',
    agentSlugs: ['job-requirements-extractor', 'application-writer', 'outreach-personalizer'],
    deploymentIds: ['dep_seed_job_req', 'dep_seed_app_writer', 'dep_seed_outreach'],
    graphDef: {
      nodes: [
        { nodeId: 'n1', nodeType: 'agent_deployment', label: 'Extract Job Requirements', deploymentId: 'dep_seed_job_req', position: { x: 100, y: 150 } },
        { nodeId: 'n2', nodeType: 'agent_deployment', label: 'Write Application', deploymentId: 'dep_seed_app_writer', position: { x: 380, y: 150 } },
        { nodeId: 'n3', nodeType: 'agent_deployment', label: 'Personalise Outreach', deploymentId: 'dep_seed_outreach', position: { x: 660, y: 150 } },
      ],
      edges: [
        { edgeId: 'e1', from: 'n1', to: 'n2', executionMode: 'sequential', label: 'Requirements' },
        { edgeId: 'e2', from: 'n2', to: 'n3', executionMode: 'sequential', label: 'Application Package' },
      ],
    },
    inputSchema: {
      type: 'object',
      required: ['job_description'],
      properties: {
        job_description: { type: 'string', description: 'The full job description text or URL content' },
        candidate_name: { type: 'string', description: 'Your full name' },
        candidate_background: { type: 'string', description: 'Your experience, skills, and achievements (2-3 paragraphs or bullet points)' },
        company_name: { type: 'string', description: 'Company name (optional — will be extracted from JD if not provided)' },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        linkedin_message: { type: 'string' },
        email_subject: { type: 'string' },
        email_body: { type: 'string' },
        cover_letter: { type: 'string' },
        resume_bullets: { type: 'array' },
        key_talking_points: { type: 'array' },
      },
    },
  },

  // ── Flow 2: Support Ticket Intelligence ──────────────────────────
  {
    id: 'flo_seed_support',
    name: 'Support Ticket Intelligence',
    description: 'Incoming ticket → classify and route → tier-1 auto-reply for routine tickets, or escalation triage with human review gate for critical issues.',
    agentSlugs: ['ticket-classifier', 'tier-1-reply', 'escalation-triage'],
    deploymentIds: ['dep_seed_ticket_clf', 'dep_seed_tier1_reply', 'dep_seed_escalation'],
    graphDef: {
      nodes: [
        { nodeId: 'n1', nodeType: 'agent_deployment', label: 'Classify Ticket', deploymentId: 'dep_seed_ticket_clf', position: { x: 100, y: 200 } },
        { nodeId: 'n2', nodeType: 'agent_deployment', label: 'Tier-1 Reply', deploymentId: 'dep_seed_tier1_reply', position: { x: 400, y: 80 } },
        { nodeId: 'n3', nodeType: 'agent_deployment', label: 'Escalation Triage', deploymentId: 'dep_seed_escalation', position: { x: 400, y: 320 } },
        { nodeId: 'n4', nodeType: 'human_review_gate', label: 'Human Review', position: { x: 680, y: 320 } },
      ],
      edges: [
        { edgeId: 'e1', from: 'n1', to: 'n2', executionMode: 'sequential', condition: 'output.is_escalation === false', label: 'Routine' },
        { edgeId: 'e2', from: 'n1', to: 'n3', executionMode: 'sequential', condition: 'output.is_escalation === true', label: 'Escalation' },
        { edgeId: 'e3', from: 'n3', to: 'n4', executionMode: 'sequential', label: 'Needs Review' },
      ],
    },
    inputSchema: {
      type: 'object',
      required: ['subject', 'description'],
      properties: {
        ticket_id: { type: 'string', description: 'Source ticket ID (Zendesk, etc.)' },
        subject: { type: 'string', description: 'Ticket subject line' },
        description: { type: 'string', description: 'Full ticket body / customer message' },
        customer_tier: { type: 'string', enum: ['free', 'pro', 'enterprise'], description: 'Customer plan tier' },
        previous_contacts: { type: 'number', description: 'Number of previous support contacts' },
        requester_name: { type: 'string', description: 'Customer name' },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        reply: { type: 'string' },
        urgency_label: { type: 'string' },
        recommended_team: { type: 'string' },
        confidence_score: { type: 'number' },
      },
    },
  },

  // ── Flow 3: Engineering Daily Digest ─────────────────────────────
  {
    id: 'flo_seed_eng_digest',
    name: 'Engineering Daily Digest',
    description: 'Runs every morning: summarises async standups, parses GitHub activity, then composes a comprehensive team digest posted to Slack — no morning meeting required.',
    agentSlugs: ['standup-summarizer', 'github-activity-summariser', 'team-digest-composer'],
    deploymentIds: ['dep_seed_standup', 'dep_seed_github', 'dep_seed_digest'],
    graphDef: {
      nodes: [
        { nodeId: 'n1', nodeType: 'agent_deployment', label: 'Summarise Standups', deploymentId: 'dep_seed_standup', position: { x: 100, y: 150 } },
        { nodeId: 'n2', nodeType: 'agent_deployment', label: 'Summarise GitHub Activity', deploymentId: 'dep_seed_github', position: { x: 380, y: 150 } },
        { nodeId: 'n3', nodeType: 'agent_deployment', label: 'Compose Team Digest', deploymentId: 'dep_seed_digest', position: { x: 660, y: 150 } },
      ],
      edges: [
        { edgeId: 'e1', from: 'n1', to: 'n2', executionMode: 'sequential', label: 'Standup Summary' },
        { edgeId: 'e2', from: 'n2', to: 'n3', executionMode: 'sequential', label: 'Combined Data' },
      ],
    },
    inputSchema: {
      type: 'object',
      required: ['standup_messages'],
      properties: {
        standup_messages: {
          type: 'array',
          description: 'Array of standup message objects: [{ user: string, text: string, timestamp: string }]',
          items: { type: 'object' },
        },
        github_events: {
          type: 'array',
          description: 'GitHub webhook events or API response (optional — GitHub connector auto-fetches if connected)',
          items: { type: 'object' },
        },
        team_members: { type: 'array', items: { type: 'string' }, description: 'Expected team members list' },
        team_name: { type: 'string', description: 'Team name for the digest header' },
        date: { type: 'string', description: 'Date for the digest (defaults to today)' },
        digest_channel: { type: 'string', description: 'Slack channel to post digest to (e.g. #engineering)' },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        slack_message: { type: 'string' },
        action_items: { type: 'array' },
        blockers: { type: 'array' },
        health_score: { type: 'number' },
      },
    },
  },
]

async function seedFlows() {
  const url = process.env.DATABASE_URL
  if (!url) { console.error('DATABASE_URL not set'); process.exit(1) }
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} })

  console.log('Seeding flow agents, deployments, and flows...')

  for (const flowDef of FLOW_DEFS) {
    // 1. Create deployments for each agent in the flow
    for (let i = 0; i < flowDef.agentSlugs.length; i++) {
      const agentSlug = flowDef.agentSlugs[i]!
      const depId = flowDef.deploymentIds[i]!

      // Find agent + version by slug
      const agents = await sql.unsafe(`SELECT id, latest_published_version_id FROM agents WHERE slug = '${esc(agentSlug)}'`) as Array<{ id: string; latest_published_version_id: string | null }>
      if (agents.length === 0) {
        console.warn(`⚠️  Agent not found: ${agentSlug} — skipping deployment ${depId}`)
        continue
      }
      const agent = agents[0]!
      const versionId = agent.latest_published_version_id
      if (!versionId) {
        console.warn(`⚠️  No published version for ${agentSlug} — skipping`)
        continue
      }

      const webhookUrl = `/v1/hooks/${SEED_WORKSPACE_ID}/${depId}`
      const encryptedConfig = 'seed_no_config'
      const connectorBindings = '[]'
      const triggerConfig = '{}'
      const alertChannels = '[]'

      await sql.unsafe(`
        INSERT INTO deployments (
          id, workspace_id, agent_id, agent_version_id, instance_name,
          connector_bindings, encrypted_config, trigger_type, trigger_config,
          execution_mode, alert_channels, max_runs_per_hour, status,
          webhook_url, webhook_secret, run_count
        ) VALUES (
          '${depId}', '${SEED_WORKSPACE_ID}', '${agent.id}', '${versionId}',
          '${esc(agentSlug)} (Seed)',
          '${connectorBindings}'::jsonb, '${encryptedConfig}',
          'webhook'::trigger_type, '${triggerConfig}'::jsonb,
          'async'::execution_mode, '${alertChannels}'::jsonb,
          1000, 'active'::deployment_status,
          '${webhookUrl}', 'seed_webhook_secret_${depId}', 0
        )
        ON CONFLICT (id) DO UPDATE SET
          status = 'active'::deployment_status,
          agent_id = EXCLUDED.agent_id,
          agent_version_id = EXCLUDED.agent_version_id
      `)
      console.log(`  ✓ Deployment ${depId} (${agentSlug})`)
    }

    // 2. Create the flow
    const graphDefJson = JSON.stringify(flowDef.graphDef).replace(/'/g, "''")
    const inputSchemaJson = JSON.stringify(flowDef.inputSchema).replace(/'/g, "''")
    const outputSchemaJson = JSON.stringify(flowDef.outputSchema).replace(/'/g, "''")

    await sql.unsafe(`
      INSERT INTO flows (id, workspace_id, name, description, graph_def, input_schema, output_schema, status)
      VALUES (
        '${flowDef.id}', '${SEED_WORKSPACE_ID}',
        '${esc(flowDef.name)}', '${esc(flowDef.description)}',
        '${graphDefJson}'::jsonb,
        '${inputSchemaJson}'::jsonb,
        '${outputSchemaJson}'::jsonb,
        'active'::flow_status
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        graph_def = EXCLUDED.graph_def,
        input_schema = EXCLUDED.input_schema,
        output_schema = EXCLUDED.output_schema,
        status = EXCLUDED.status
    `)
    console.log(`✅ Flow: ${flowDef.name}`)
  }

  console.log('\n✅ Flow seed complete')
  await sql.end()
  process.exit(0)
}

seedFlows().catch(err => { console.error('Flow seed failed:', err.message); process.exit(1) })

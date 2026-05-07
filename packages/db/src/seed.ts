import postgres from 'postgres'
import path from 'path'

const SEED_USER_ID = 'user_seed_001'
const SEED_WORKSPACE_ID = 'ws_seed_001'


function generateId(prefix: string): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = prefix + '_'
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

// Escape single quotes to prevent SQL injection in seed data
function esc(val: string): string {
  return val.replace(/'/g, "''")
}


async function seed() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error("DATABASE_URL is not set")
    process.exit(1)
  }

  console.log('Connecting to database...')
  const client = postgres(url, { max: 1, prepare: false, onnotice: () => { } })
  console.log("✅ Connected to database")

  console.log("Seeding database...")

  // seed user
  await client.unsafe(`
  INSERT INTO users (id, email, name) 
  VALUES ('${SEED_USER_ID}', 'admin@runlet.ai', 'Runlet Admin')
  ON CONFLICT (id) DO NOTHING
  `)
  console.log("✅ Seeded user ")


  // Seed workspace
  await client.unsafe(`
  INSERT INTO workspaces (id, name, slug, plan)
  VALUES ('${SEED_WORKSPACE_ID}', 'Runlet HQ', 'runlet-hq', 'pro'::workspace_plan)
  ON CONFLICT (id) DO NOTHING
  `)
  console.log("✅ Seeded workspace ")

  // Seed workspace members
  const wmId = generateId('wm')
  await client.unsafe(`
  INSERT INTO workspace_members (id, workspace_id, user_id, role) 
  VALUES ('${wmId}', '${SEED_WORKSPACE_ID}', '${SEED_USER_ID}', 'owner'::workspace_role)
  ON CONFLICT (id) DO NOTHING
  `)
  console.log("✅ Seeded workspace members")


  // Seed the 5MVP agent data
  const agentData = [
    {
      slug: 'tier-1-reply',
      displayName: 'Tier-1 Reply Agent',
      tagline: 'Reads support tickets, searches your knowledge base, and drafts branded replies',
      vertical: 'customer_support',
      category: 'Ticket Handling',
      tags: ['zendesk', 'support', 'auto-reply', 'kb']
    },
    {
      slug: 'escalation-triage',
      displayName: 'Escalation Triage Agent',
      tagline: 'Scores tickets urgency, detects churn signals, and routes to the right team',
      vertical: 'customer_support',
      category: 'Routing',
      tags: ['zendesk', 'slack', 'escalation', 'sentiment']
    },
    {
      slug: 'standup-summarizer',
      displayName: 'Standup Summariser',
      tagline: 'Reads async standups from Slack and generates a daily digest with blockers highlighted',
      vertical: 'engineering',
      category: 'Communication',
      tags: ['slack', 'standup', 'async', 'digest']
    },
    {
      slug: 'pr-review-summariser',
      displayName: 'PR Review Summariser',
      tagline: 'Reads PR diffs, generates plain-English summaries and flags risk areas',
      vertical: 'engineering',
      category: 'Code Quality',
      tags: ['github', 'pull-request', 'code-review', 'slack']
    },
    {
      slug: 'kb-gap-detector',
      displayName: 'KB Gap Detector',
      tagline: 'Clusters no-match support tickets and drafts new knowledge base articles',
      vertical: 'customer_support',
      category: 'Knowledge',
      tags: ['zendesk', 'notion', 'knowledge-base', 'content']
    }
  ]

  for (const agent of agentData) {
    const id = generateId('agt')
    await client.unsafe(`
      INSERT INTO agents (id, slug, display_name, tagline, vertical, category, status, visibility, licence, author_id)
      VALUES ('${id}', '${esc(agent.slug)}', '${esc(agent.displayName)}', '${esc(agent.tagline)}', '${esc(agent.vertical)}', '${esc(agent.category)}', 'published'::agent_status, 'public'::agent_visibility, 'runlet_open'::agent_licence, '${SEED_USER_ID}') ON CONFLICT (id) DO NOTHING`)
    console.log('✅ Seed agent partial data inserted')
    const tagStr = agent.tags.join(",")
    await client.unsafe(`
      UPDATE agents SET tags= string_to_array('${esc(tagStr)}', ',') WHERE slug='${esc(agent.slug)}'`)
    console.log('✅ Seed agent tags updated')
    console.log(`✅  Seeded agent: ${agent.displayName}`)
  }

  console.log('✅ Seed complete')
  await client.end()
  process.exit(0)
}

seed().catch(err => { console.error('Seed failed: ', err); process.exit(1) })

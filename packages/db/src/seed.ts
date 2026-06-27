import postgres from 'postgres'
import bcrypt from 'bcryptjs'
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

  // Local dev only — password is intentionally weak and only used locally
  const passwordHash = await bcrypt.hash('Admin123!', 12)
  await client`
    INSERT INTO users (id, email, name, password_hash, email_verified)
    VALUES (${SEED_USER_ID}, 'admin@runlet.ai', 'Runlet Admin', ${passwordHash}, NOW())
    ON CONFLICT (email) DO UPDATE SET
      password_hash = EXCLUDED.password_hash,
      email_verified = COALESCE(users.email_verified, NOW())
  `
  console.log("✅ Seeded user (local dev password: Admin123!)")


  // Seed workspace
  await client.unsafe(`
  INSERT INTO workspaces (id, name, slug, plan)
  VALUES ('${SEED_WORKSPACE_ID}', 'Runlet HQ', 'runlet-hq', 'pro'::workspace_plan)
  ON CONFLICT (id) DO NOTHING
  `)
  console.log("✅ Seeded workspace ")

  // Seed workspace members — guard against duplicates with NOT EXISTS
  const wmId = generateId('wm')
  await client.unsafe(`
  INSERT INTO workspace_members (id, workspace_id, user_id, role)
  SELECT '${wmId}', '${SEED_WORKSPACE_ID}', '${SEED_USER_ID}', 'owner'::workspace_role
  WHERE NOT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = '${SEED_WORKSPACE_ID}' AND user_id = '${SEED_USER_ID}'
  )
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
    },
    // ── Flow 1: Job Application Pipeline agents ──────────────────
    {
      slug: 'job-requirements-extractor',
      displayName: 'Job Requirements Extractor',
      tagline: 'Parses any job description and extracts structured requirements, skills, and culture signals',
      vertical: 'operations',
      category: 'Hiring',
      tags: ['job-search', 'hiring', 'career', 'recruiting']
    },
    {
      slug: 'application-writer',
      displayName: 'Application Writer',
      tagline: 'Writes tailored cover letters and resume bullets matched to specific job requirements',
      vertical: 'operations',
      category: 'Hiring',
      tags: ['cover-letter', 'resume', 'job-search', 'career']
    },
    {
      slug: 'outreach-personalizer',
      displayName: 'Outreach Personalizer',
      tagline: 'Crafts personalised LinkedIn messages and emails that stand out to hiring managers',
      vertical: 'sales',
      category: 'Outreach',
      tags: ['linkedin', 'email', 'job-search', 'networking']
    },
    // ── Flow 2: Support Intelligence Pipeline agents ─────────────
    {
      slug: 'ticket-classifier',
      displayName: 'Ticket Classifier',
      tagline: 'Instantly classifies support ticket type, urgency, and escalation need with 95%+ accuracy',
      vertical: 'customer_support',
      category: 'Routing',
      tags: ['zendesk', 'classification', 'routing', 'triage']
    },
    // ── Gmail Digest ─────────────────────────────────────────────
    {
      slug: 'gmail-digest',
      displayName: 'Gmail Digest',
      tagline: 'Reads your unread Gmail messages from the last 7 days and delivers a prioritised summary',
      vertical: 'operations',
      category: 'Communication',
      tags: ['gmail', 'email', 'digest', 'inbox', 'summary']
    },
    // ── Flow 3: Engineering Daily Digest agents ──────────────────
    {
      slug: 'github-activity-summariser',
      displayName: 'GitHub Activity Summariser',
      tagline: 'Turns raw GitHub events into a readable activity summary for your team digest',
      vertical: 'engineering',
      category: 'Communication',
      tags: ['github', 'digest', 'activity', 'engineering']
    },
    {
      slug: 'team-digest-composer',
      displayName: 'Team Digest Composer',
      tagline: 'Combines standup summaries and GitHub activity into a comprehensive daily team digest',
      vertical: 'engineering',
      category: 'Communication',
      tags: ['slack', 'digest', 'standup', 'github', 'daily']
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

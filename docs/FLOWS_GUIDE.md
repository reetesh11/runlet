# Runlet Flows — Complete Guide

**How to build, configure, and run multi-agent AI pipelines**

---

## What is a Flow?

A **Flow** is a directed graph of AI agents that execute in sequence or in parallel. Each node in the graph is a deployed agent; each edge carries data from one agent's output to the next agent's input. Flows let you compose complex, multi-step AI automation that no single agent could handle alone.

Think of a Flow as a mini-pipeline:

```
[Input Data] → Agent A → Agent B → Agent C → [Final Output + Actions]
```

Each agent runs the full T1–T9 execution lifecycle (guardrails, LLM call, connector actions, audit), so every step is observable, safe, and auditable — even inside a multi-agent pipeline.

---

## Core Concepts

### Nodes

Every node in a flow is one of four types:

| Node Type | Purpose |
|---|---|
| **Agent Deployment** | Runs a deployed agent and passes its output downstream |
| **Sub-flow** | Invokes another flow as a nested step (max depth: 10) |
| **Transform** | Re-maps data fields between agents with no LLM call |
| **Human Review Gate** | Pauses the flow for a human to approve/reject before continuing |

### Edges

Edges connect nodes and define:
- **Execution mode**: `sequential` (one after the other) or `parallel` (concurrent)
- **Condition**: Optional expression that must evaluate to `true` for the edge to activate (e.g. `output.is_escalation === true`)
- **Data mapping**: Optional field re-mapping so downstream agents receive the exact field names they expect

### Data Flow

Every node receives the previous node's output as its input. The output of the final node is the flow's output.

For branching flows, each branch receives the branching node's output. For parallel edges, all parallel nodes receive the same input simultaneously.

### Flow Runs

When a flow is triggered, a **flow run** is created. Each flow run tracks:
- Overall status (`queued → running → success/failed`)
- Per-node state (which nodes ran, their run IDs, status)
- Input and output payload references (stored encrypted in R2)

---

## The Three Pre-Built Flows

Runlet ships three production-ready flows covering the most common enterprise use cases.

---

### Flow 1: Job Application Pipeline

**Category:** HR / Operations  
**Trigger:** Manual or API  
**Estimated time:** ~45 seconds

#### What it does

Takes a job description and a candidate's background, then automatically produces a complete application package:
1. Extracts structured requirements from the JD
2. Writes a tailored cover letter and resume bullets
3. Crafts personalised LinkedIn and email outreach messages

#### Pipeline

```
Input
  ↓
[job-requirements-extractor]
  • Parses the JD
  • Outputs: role_title, required_skills, experience_years, key_responsibilities,
             company_culture, remote_policy, red_flags
  ↓
[application-writer]
  • Receives extracted requirements
  • Outputs: cover_letter, resume_bullets (per role), key_talking_points, skills_match_score
  ↓
[outreach-personalizer]
  • Receives application package
  • Outputs: linkedin_message (<300 chars), email_subject, email_body, follow_up_message
```

#### Input Schema

```json
{
  "job_description": "Senior Software Engineer at Acme Corp. We're looking for...",
  "candidate_name": "Jane Doe",
  "candidate_background": "5 years of backend engineering. Led migration of monolith to microservices at XYZ (3x throughput). TypeScript, Node.js, PostgreSQL, AWS.",
  "company_name": "Acme Corp"
}
```

#### Output

The final output contains everything needed to apply:

```json
{
  "linkedin_message": "Hi [name], I saw Acme is building [X]. Your team's work on [Y] caught my eye — I did similar work at XYZ and would love to connect.",
  "email_subject": "From 3x throughput to your platform — let's talk",
  "email_body": "Hi [hiring manager name],\n\nAt XYZ I led the migration that tripled our API throughput...",
  "cover_letter": "Dear Hiring Team,\n\nThe role of Senior Software Engineer at Acme Corp is...",
  "resume_bullets": [
    {
      "role": "Senior Engineer, XYZ Corp",
      "bullets": [
        "Led microservices migration reducing p99 latency by 65% across 40+ services",
        "Built real-time data pipeline processing 2M events/day using TypeScript + Kafka"
      ]
    }
  ],
  "key_talking_points": [
    "Scale story: monolith → microservices, 3x throughput",
    "TypeScript/Node.js depth, specifically around async patterns",
    "Experience leading cross-functional projects with 8 engineers"
  ]
}
```

#### How to use

1. Go to **Flows → Templates → Job Application Pipeline**
2. Click **Run Now**
3. Paste the job description (copy the full text from the job posting)
4. Add your background (a few sentences or bullet points about your experience)
5. Click **Trigger**
6. View the trace in **Runs** — output appears in ~45 seconds

**Optional: Connect Notion**  
If you connect a Notion connector with `pages:write` scope and set `notion_database_id` in the deployment config, the application package is automatically saved as a Notion page for tracking.

**Optional: Run at scale**  
Use the webhook trigger to pipe job postings directly from job boards, LinkedIn alerts, or RSS feeds into the pipeline. POST to the flow's webhook URL:

```bash
curl -X POST https://your-domain/v1/hooks/{workspaceId}/{flowId} \
  -H "Content-Type: application/json" \
  -d '{
    "job_description": "...",
    "candidate_name": "Jane Doe",
    "candidate_background": "..."
  }'
```

---

### Flow 2: Support Ticket Intelligence

**Category:** Customer Support  
**Trigger:** Webhook (connect to Zendesk/support system)  
**Estimated time:** ~20 seconds

#### What it does

An incoming support ticket goes through automatic triage and routing — no human needed for the first decision:
1. **Classifier** determines ticket type, urgency, and whether escalation is needed
2. **Routine tickets** → Tier-1 Reply agent drafts and (optionally) posts a public reply to Zendesk
3. **Escalation tickets** → Escalation Triage agent scores urgency, detects churn risk, routes to the right team, optionally Slacks the escalation channel — then pauses for **Human Review** before any action is taken

#### Pipeline

```
Input (ticket data)
  ↓
[ticket-classifier]
  • Outputs: ticket_type, urgency, is_escalation, category, sentiment
  ↓
  ├── [is_escalation === false] ──→ [tier-1-reply]
  │                                   • Drafts reply, posts to Zendesk
  │                                   • Output: reply, confidence_score
  │
  └── [is_escalation === true] ───→ [escalation-triage]
                                      • Scores urgency 1-10
                                      • Detects churn signals
                                      • Routes to correct team
                                      • Slacks escalation channel
                                      ↓
                                    [Human Review Gate]
                                      • Pauses for human approval
                                      • Go to Review queue → Approve/Reject
```

#### Input Schema

```json
{
  "ticket_id": "ZD-12345",
  "subject": "Can't access my account after password reset",
  "description": "I tried to reset my password 3 times but the link keeps expiring within seconds. This is urgent, I have a client demo in 2 hours.",
  "customer_tier": "enterprise",
  "previous_contacts": 2,
  "requester_name": "John Smith"
}
```

#### Routing logic

| Classification | What happens |
|---|---|
| `billing` + medium urgency | tier-1-reply drafts a standard billing response |
| `technical` + low urgency | tier-1-reply drafts a technical response |
| `technical` + critical | escalation-triage → engineering team → Human Review |
| `account` + enterprise tier | always escalates → account management → Human Review |
| Any + explicit churn signals | escalation-triage → churn risk Slack alert → Human Review |

#### Human Review queue

When a ticket hits the Human Review Gate, it appears in **Review** in the sidebar. Each review shows:
- The ticket content
- The triage agent's recommendation (team, urgency score)
- Confidence score (colour-coded bar)
- Approve (continue pipeline) / Reject (mark as failed) buttons
- Notes field for reviewer comments

#### How to set up with Zendesk

1. **Connect Zendesk**: Go to Connectors → Add Connector → Zendesk → enter your subdomain and API key
2. **Configure the Tier-1 Reply deployment**: set `company_name`, `product_name`, `tone` in the config card
3. **Configure escalation**: set `escalation_slack_channel` in the Escalation Triage deployment config
4. **Set the webhook**: copy the flow's webhook URL from the flow detail page
5. **In Zendesk**: create a trigger that fires on ticket creation → HTTP POST to the Runlet webhook URL with `{{ticket.id}}`, `{{ticket.subject}}`, `{{ticket.description}}`, `{{ticket.requester.name}}`

---

### Flow 3: Engineering Daily Digest

**Category:** Engineering  
**Trigger:** Schedule (every day at 9:00 AM)  
**Estimated time:** ~60 seconds

#### What it does

Every morning, this flow runs automatically and posts a comprehensive team digest to Slack — replacing the 30-minute daily standup meeting:
1. **Standup Summariser** reads async standup messages and extracts who did what, blockers, and missing reporters
2. **GitHub Activity Summariser** parses GitHub events from the past 24 hours and surfaces PRs merged, commits, and risks
3. **Team Digest Composer** combines both summaries into a structured, emoji-rich Slack message

#### Pipeline

```
Input (standup messages + GitHub events)
  ↓
[standup-summarizer]
  • Outputs: digest_text, blockers[], team_members_reported, theme_of_the_day
  ↓
[github-activity-summariser]
  • Receives standup output (passes through)
  • Outputs: prs_merged, highlights[], by_contributor{}, risks[], github_summary_text
  ↓
[team-digest-composer]
  • Combines standup digest + GitHub summary
  • Outputs: slack_message, action_items[], blockers[], health_score
  • Posts to Slack via connector
```

#### Example Slack output

```
🚀 Engineering Daily Digest — Thursday, 21 Jun

📦 Shipped Yesterday
• Merged 4 PRs: auth refactor, payment retry logic, dashboard perf fix, API rate limit
• alice: Shipped the Stripe webhook handler (was blocked last week)
• bob: Closed 3 stale issues from Q1

📋 Team Standup
• alice — Working on payments integration. Completed webhook handler.
• bob — Code reviews + documentation. No blockers.
• charlie — NOT REPORTED ⚠️

🚨 Blockers (1)
• Design handoff for mobile nav still pending → alice blocking for 2 days

⚠️ Needs Attention
• PR #247 open 4 days with no review requested — @bob
• Main branch has 3 commits ahead of staging — deploy recommended

✅ Action Items
• @charlie: Submit standup by 10am
• @bob: Review PR #247 before EOD
• @team: Deploy staging → production (3 commits ready)

Team health: 7/10 — Good momentum, one blocker to clear.
```

#### How to set up

**Option A: Manual daily run**
1. Go to **Flows → Templates → Engineering Daily Digest**
2. Click **Run Now** and paste your team's standup messages as JSON:
   ```json
   {
     "standup_messages": [
       { "user": "alice", "text": "Yesterday: shipped auth. Today: payments. Blocked: design." },
       { "user": "bob", "text": "Yesterday: bug fix. Today: reviews. No blockers." }
     ],
     "team_members": ["alice", "bob", "charlie"],
     "team_name": "Platform Team",
     "digest_channel": "#engineering"
   }
   ```

**Option B: Scheduled (recommended)**
1. Configure the flow's first deployment (standup-summarizer) trigger type as **schedule**
2. Set `cronExpression` to `0 9 * * 1-5` (9am weekdays)
3. Set up a Slack bot to collect standup messages and POST them to the flow webhook at 8:55am
4. Connect your Slack connector (used by team-digest-composer to post the final digest)

**Option C: Slack integration**
1. Create a Slack app that reads messages from your `#standup` channel each morning
2. POST the collected messages to the Runlet webhook
3. The flow runs, composes the digest, and posts it back to `#engineering`

---

## Building Your Own Flow

### Step 1: Design the pipeline on paper

Before opening the flow builder, answer:

1. **What is the input?** A webhook payload, a scheduled trigger, a manual form?
2. **What agents do you need?** What does each one do?
3. **What data flows between them?** What output from agent A does agent B need?
4. **Are there branches?** What condition determines which path to take?
5. **Do you need human review?** At which confidence threshold?
6. **What actions happen?** Which connectors execute at which step?

**Rule of thumb:** A good flow has 2-4 agents. More than 5 agents usually means you need two flows.

### Step 2: Install the agents

Go to **Marketplace** and install each agent you need. Each agent needs a deployment with:
- A name (e.g. "My Tier-1 Reply")
- Connector bindings (if the agent uses Zendesk, Slack, etc.)
- Config values (company name, channels, thresholds)

The deployment must be **Active** before you can use it in a flow.

### Step 3: Build in the Flow Builder

Go to **Flows → New Flow** to open the canvas.

**Adding nodes:**
- Click **Agent** in the toolbar to add an agent deployment node
- In the Node Inspector (right panel), select the deployment from the dropdown
- Give the node a descriptive label

**Connecting nodes:**
- Drag from the right handle of one node to the left handle of another
- A sequential edge is created by default

**Adding conditions (branching):**
- After creating an edge, select it and add a condition expression
- Conditions use `output.fieldName` syntax: e.g. `output.is_escalation === true`
- Create two edges from the same node with opposite conditions

**Adding a transform node:**
- Use when the upstream output field names don't match downstream input expectations
- Set `config.mapping` as `{ "new_name": "$.old_name" }`

**Adding a human review gate:**
- Insert between any two agent nodes
- When reached, the flow pauses and a review request appears in the **Review** queue

### Step 4: Save and activate

1. Click **Save** — the flow is saved as a draft
2. Click **Activate** — the flow is ready to receive triggers
3. A webhook URL is shown — use this for external triggers

### Step 5: Trigger and observe

**Manual trigger:**
- Click **Run** in the flow builder header
- The flow runs with an empty input (useful for testing flows that pull their own data)

**Webhook trigger:**
```bash
curl -X POST https://your-domain.com/v1/hooks/{workspaceId}/{flowId} \
  -H "Content-Type: application/json" \
  -d '{ "your": "input data" }'
```

**View the run:**
- Go to **Flows → [your flow] → Runs**
- Click a flow run to see per-node status, run IDs, and timing
- Click any run ID to see the full T1–T9 audit trace for that agent

### Step 6: Monitor and tune

**Dashboard**: Shows total flow runs, success rate, and token usage across all flows in the last 24h.

**Review queue**: Any runs that hit a Human Review Gate appear here with the agent's proposed output and confidence score.

**Alert channels**: Configure email or Slack alerts on the deployment's config card:
- `run_failed`: Alert when an agent in the flow fails
- `run_completed`: Notify when the full pipeline completes
- Destination: email address or Slack channel ID

---

## Data Passing Between Agents

This is the most important concept to get right.

### How it works

When agent A completes, its entire output JSON is passed as the input JSON to agent B. The agent B's `buildUserMessage` function extracts the fields it cares about.

**Example:**

Agent A outputs:
```json
{
  "required_skills": ["TypeScript", "PostgreSQL"],
  "role_title": "Senior Engineer",
  "experience_years_min": 4,
  "confidence_score": 0.91
}
```

Agent B receives this as its input. Its prompt builder extracts `required_skills` and `role_title` to build the user message.

### Pass-through pattern

If agent C needs data from agent A (not agent B), use the **pass-through pattern**: design agent B to include the upstream data in its output. For example, the Standup Summariser passes through `github_events` in its output so the GitHub Activity Summariser can access them.

### Transform node pattern

When field names don't match:
- Agent A outputs `{ "summary": "..." }`
- Agent B expects `{ "standup_summary": "..." }`

Add a Transform node between them with mapping:
```json
{ "standup_summary": "$.summary" }
```

### Schema tip

Agents are most reliable when their input schema matches what they actually receive. Review each agent's input schema in the marketplace detail page before building your flow.

---

## Guardrails in Flows

Every agent node in a flow runs the full guardrail stack:

| Guardrail | What it does |
|---|---|
| Rate limit | Blocks if the deployment exceeds `maxRunsPerHour` |
| Topic block | Blocks if the input matches a blocked topic (e.g. "competitors") |
| PII mask | Masks/redacts PII before the LLM call |
| Confidence gate | If output confidence < threshold, escalates to human review |

You can override guardrail settings per deployment in the config card. The most common override is the **confidence threshold**: set it lower (e.g. 0.55) to let more outputs through automatically, or higher (e.g. 0.85) to require human review on anything uncertain.

**For critical pipelines** (payments, legal, security): always add a Human Review Gate as the final node. The review queue lets a human check the proposed output before any external action is taken.

---

## Scheduling Flows

To run a flow on a schedule:

1. Go to the first deployment's **Configure** page
2. Set **Trigger Type** to `Schedule`
3. Set `cronExpression` in **Trigger Config**:

```json
{
  "cronExpression": "0 9 * * 1-5"
}
```

Common cron expressions:

| Expression | Meaning |
|---|---|
| `0 9 * * 1-5` | 9am every weekday |
| `*/30 * * * *` | Every 30 minutes |
| `0 8 * * 1` | Every Monday at 8am |
| `0 */2 * * *` | Every 2 hours |

The Runlet worker checks active scheduled deployments every minute and fires a run when the cron matches. The input payload is empty (`{}`) for scheduled runs — design your agents to pull their own data from connectors in this case.

---

## Common Flow Patterns

### Pattern 1: Linear enrichment
Each agent enriches the data and passes it downstream. Used in the Job Application Pipeline.

```
Raw Input → Extractor → Writer → Publisher
```

### Pattern 2: Classify and branch
A classifier determines which path the data takes. Used in the Support Ticket Intelligence flow.

```
Input → Classifier
           ├── [condition A] → Handler A
           └── [condition B] → Handler B → Review Gate
```

### Pattern 3: Parallel gather → compose
Multiple agents run in parallel on different data, then a composer combines them. (Use two start nodes with no incoming edges.)

```
Input
  ├── Summariser A
  └── Summariser B
          ↓
       Composer
```

### Pattern 4: Scheduled pull → digest → notify
Runs on schedule, pulls data from connectors, produces a digest, posts to Slack.

```
[Schedule trigger] → Data Fetcher → Analyser → Digest Composer → Slack
```

### Pattern 5: Nested flows (sub-flows)
For complex pipelines, use sub-flows to keep the top-level graph readable.

```
Main Flow:
  Input → Preprocessing Sub-flow → Analysis Sub-flow → Output

Preprocessing Sub-flow:
  Normaliser → Deduplicator → Validator
```

---

## Troubleshooting

### Flow run stuck in `queued`

- Check the worker is running: `pnpm dev` starts the worker
- Check Redis connection: `docker compose ps` — is Redis running?
- Check the deployment status: it must be `active`

### Agent returns `guardrail_blocked`

- The input triggered a guardrail rule (topic block, PII, rate limit)
- Go to the run's audit trace — the `guardrail_evaluated` event shows which rule blocked
- Adjust the deployment's guardrail overrides in the config card

### Confidence too low → unwanted human review

- The LLM returned a confidence score below the threshold
- Adjust `confidenceThreshold` in the deployment's guardrail overrides (range: 0.0–1.0)
- Or set `fallbackBehaviour` to `return_error` instead of `escalate_to_human`

### Node not receiving expected data from previous node

- Check the previous agent's output schema matches the field names the current agent expects
- Add a Transform node to re-map field names
- View the previous run's output payload in the audit trace to see the actual JSON

### Flow exits early on a branch

- Ensure both branches have outgoing edges if both should reach the final node
- Check that condition syntax is exactly `output.fieldName === value` (double equals, no negation)
- Use `output.fieldName !== undefined` to check field existence

---

## API Reference

### Trigger a flow

```
POST /v1/hooks/{workspaceId}/{flowId}
Content-Type: application/json

{ ...your input payload }

Response 202:
{ "data": { "flowRunId": "flr_xxx", "status": "queued" } }
```

### Get flow run status

```
GET /api/v1/workspaces/{workspaceId}/flows/{flowId}/runs
X-Workspace-Id: {workspaceId}

Response:
{
  "data": [{
    "id": "flr_xxx",
    "status": "success",
    "nodeStates": {
      "n1": { "status": "success", "runId": "run_xxx" },
      "n2": { "status": "success", "runId": "run_yyy" }
    }
  }]
}
```

### Get individual agent run audit

```
GET /api/v1/workspaces/{workspaceId}/runs/{runId}/audit
X-Workspace-Id: {workspaceId}
```

### Create a flow

```
POST /api/v1/workspaces/{workspaceId}/flows
X-Workspace-Id: {workspaceId}

{
  "name": "My Flow",
  "description": "...",
  "graphDef": {
    "nodes": [...],
    "edges": [...]
  },
  "inputSchema": { "type": "object", "properties": {...} }
}
```

---

## Quick Setup Checklist

For each new flow:

- [ ] All required agents installed from marketplace
- [ ] Each agent has an **Active** deployment with correct config
- [ ] Connectors connected (Zendesk, Slack, GitHub, Notion)
- [ ] Flow created and activated in the Flow Builder
- [ ] Test run executed with sample input
- [ ] Audit trace reviewed — all nodes completed successfully
- [ ] Alert channels configured on each deployment
- [ ] Scheduled trigger set (if applicable)
- [ ] Webhook URL noted (if external trigger)

---

*Runlet Flows Documentation · Updated June 2026*

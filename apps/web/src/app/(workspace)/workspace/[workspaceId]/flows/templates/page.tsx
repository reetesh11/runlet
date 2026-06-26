import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Play, GitBranch, Users, Zap, Clock, Bot } from 'lucide-react'

const FLOW_TEMPLATES = [
  {
    id: 'flo_seed_job_app',
    name: 'Job Application Pipeline',
    description: 'Paste a job description and your background — get a tailored cover letter, resume bullets, and personalised LinkedIn/email outreach messages.',
    category: 'Career',
    color: 'brand',
    icon: '💼',
    nodes: ['Job Requirements Extractor', 'Application Writer', 'Outreach Personalizer'],
    triggerType: 'manual',
    estimatedTime: '~45 seconds',
    useCases: [
      'Applying to multiple roles simultaneously',
      'Tailoring generic applications to specific JDs',
      'Generating outreach to hiring managers',
    ],
    inputExample: {
      job_description: 'Senior Software Engineer at Acme Corp...',
      candidate_name: 'Jane Doe',
      candidate_background: '5 years backend engineering, TypeScript, Node.js...',
    },
  },
  {
    id: 'flo_seed_support',
    name: 'Support Ticket Intelligence',
    description: 'Incoming ticket → auto-classify and route → tier-1 auto-reply for routine issues, or escalation triage with human review gate for critical cases.',
    category: 'Customer Support',
    color: 'blue',
    icon: '🎫',
    nodes: ['Ticket Classifier', 'Tier-1 Reply (routine)', 'Escalation Triage → Human Review (critical)'],
    triggerType: 'webhook',
    estimatedTime: '~20 seconds',
    useCases: [
      'Auto-handling billing and account questions',
      'Routing critical tickets to the right team instantly',
      'Reducing tier-1 support volume by 60%+',
    ],
    inputExample: {
      ticket_id: 'ZD-12345',
      subject: "Can't log in after password reset",
      description: "I reset my password but the link expired...",
      customer_tier: 'pro',
    },
  },
  {
    id: 'flo_seed_eng_digest',
    name: 'Engineering Daily Digest',
    description: 'Runs every morning via schedule: summarises async standups + GitHub activity, then composes and posts a comprehensive team digest to Slack.',
    category: 'Engineering',
    color: 'amber',
    icon: '📋',
    nodes: ['Standup Summariser', 'GitHub Activity Summariser', 'Team Digest Composer'],
    triggerType: 'schedule',
    estimatedTime: '~60 seconds',
    useCases: [
      'Replace daily standup meetings with async digests',
      'Keep distributed teams aligned on priorities and blockers',
      'Surface GitHub activity and risks automatically',
    ],
    inputExample: {
      standup_messages: [
        { user: 'alice', text: 'Yesterday: shipped auth. Today: working on payments. Blocked: waiting on design.' },
        { user: 'bob', text: 'Yesterday: fixed prod bug. Today: code review + docs. No blockers.' },
      ],
      github_events: [],
      team_name: 'Platform Team',
      digest_channel: '#engineering',
    },
  },
]

const COLOR_MAP: Record<string, { bg: string; text: string; border: string; icon: string }> = {
  brand: {
    bg: 'bg-brand-500/10',
    text: 'text-brand-400',
    border: 'border-brand-500/20',
    icon: 'bg-brand-500/20',
  },
  blue: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    border: 'border-blue-500/20',
    icon: 'bg-blue-500/20',
  },
  amber: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'border-amber-500/20',
    icon: 'bg-amber-500/20',
  },
}

export default async function FlowTemplatesPage({ params }: { params: { workspaceId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const { workspaceId } = params

  return (
    <div className="p-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href={`/workspace/${workspaceId}/flows`}
          className="text-gray-600 hover:text-gray-400 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-white">Flow Templates</h1>
          <p className="text-sm text-gray-500">Pre-built multi-agent pipelines ready to deploy</p>
        </div>
      </div>

      {/* Templates grid */}
      <div className="space-y-6">
        {FLOW_TEMPLATES.map(template => {
          const colors = COLOR_MAP[template.color] ?? COLOR_MAP.brand!
          return (
            <div
              key={template.id}
              className="bg-white/3 border border-white/7 rounded-2xl p-6 hover:border-white/12 transition-colors"
            >
              <div className="flex items-start gap-5">
                {/* Icon */}
                <div className={`w-14 h-14 rounded-xl ${colors.icon} flex items-center justify-center text-2xl shrink-0`}>
                  {template.icon}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h2 className="text-base font-semibold text-white">{template.name}</h2>
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${colors.bg} ${colors.text} ${colors.border}`}>
                          {template.category}
                        </span>
                      </div>
                      <p className="text-sm text-gray-400 leading-relaxed mb-4">{template.description}</p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Link
                        href={`/workspace/${workspaceId}/flows/${template.id}`}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-xs font-medium rounded-lg transition-colors"
                      >
                        <GitBranch className="w-3 h-3" /> View Flow
                      </Link>
                      <Link
                        href={`/workspace/${workspaceId}/flows/${template.id}/runs`}
                        className={`flex items-center gap-1.5 px-3 py-1.5 ${colors.bg} hover:opacity-90 border ${colors.border} ${colors.text} text-xs font-medium rounded-lg transition-colors`}
                      >
                        <Play className="w-3 h-3" /> Run Now
                      </Link>
                    </div>
                  </div>

                  {/* Pipeline nodes */}
                  <div className="flex items-center gap-2 mb-4 flex-wrap">
                    {template.nodes.map((node, i) => (
                      <div key={node} className="flex items-center gap-1.5">
                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 border border-white/8 rounded-lg">
                          <Bot className="w-3 h-3 text-gray-500" />
                          <span className="text-xs text-gray-400">{node}</span>
                        </div>
                        {i < template.nodes.length - 1 && (
                          <span className="text-gray-700 text-xs">→</span>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Meta + use cases */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">Use cases</p>
                      <ul className="space-y-1">
                        {template.useCases.map(uc => (
                          <li key={uc} className="flex items-start gap-1.5 text-xs text-gray-500">
                            <Zap className="w-3 h-3 text-gray-600 mt-0.5 shrink-0" />
                            {uc}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">Details</p>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <Clock className="w-3 h-3 text-gray-600" />
                          Estimated: {template.estimatedTime}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <GitBranch className="w-3 h-3 text-gray-600" />
                          Trigger: {template.triggerType}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <Bot className="w-3 h-3 text-gray-600" />
                          {template.nodes.length} agents in pipeline
                        </div>
                      </div>
                      {/* Sample payload */}
                      <details className="mt-3">
                        <summary className="text-xs text-gray-600 hover:text-gray-400 cursor-pointer select-none">
                          View example input ↓
                        </summary>
                        <pre className="mt-2 text-xs font-mono text-gray-600 bg-black/20 rounded-lg p-3 overflow-x-auto max-h-36">
                          {JSON.stringify(template.inputExample, null, 2)}
                        </pre>
                      </details>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Build your own CTA */}
      <div className="mt-8 bg-brand-500/5 border border-brand-500/15 rounded-2xl p-6 text-center">
        <GitBranch className="w-8 h-8 text-brand-400/60 mx-auto mb-3" />
        <h3 className="text-sm font-semibold text-white mb-1">Build your own flow</h3>
        <p className="text-xs text-gray-500 mb-4 max-w-md mx-auto">
          Connect any combination of agents with conditional routing, parallel execution, transform nodes, and human review gates.
        </p>
        <Link
          href={`/workspace/${workspaceId}/flows/new`}
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-400 text-white text-sm font-medium rounded-xl transition-colors"
        >
          <Users className="w-4 h-4" /> Open Flow Builder
        </Link>
      </div>
    </div>
  )
}

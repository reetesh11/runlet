import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { hash } from 'bcryptjs'
import { createHash } from 'crypto'
import { and, eq } from 'drizzle-orm'
import { createApiDb, schema } from '@/lib/db'
import { generateId } from '@runlet/utils'
import { checkRateLimit } from '@/lib/rate-limit'

const AcceptInviteSchema = z.object({
  token: z.string().min(1, 'Token is required.'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .max(72, 'Password must be at most 72 characters.')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter.')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter.')
    .regex(/[0-9]/, 'Password must contain at least one number.'),
})

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

export async function POST(req: NextRequest) {
  console.log('[accept-invite] POST')

  // ── Rate limit ──────────────────────────────────────────────────
  const ip = req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() ?? '127.0.0.1'
  const { allowed } = await checkRateLimit(`rl:accept-invite:${ip}`, 10, 3600)
  if (!allowed) {
    console.warn(`[accept-invite] rate limited — ip=${ip}`)
    return NextResponse.json(
      { error: 'Too many requests. Please try again in an hour.' },
      { status: 429 },
    )
  }

  // ── Parse body ──────────────────────────────────────────────────
  let body: unknown
  try {
    body = await req.json()
  } catch {
    console.warn('[accept-invite] invalid JSON body')
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const parsed = AcceptInviteSchema.safeParse(body)
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Invalid input.'
    console.warn(`[accept-invite] validation failed — ${msg}`)
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const { token, password } = parsed.data
  const tokenHash = hashToken(token)

  // Hash password before the transaction — bcrypt at cost 12 takes ~300ms
  // and holding a DB transaction open that long is wasteful
  console.log('[accept-invite] hashing password...')
  const passwordHash = await hash(password, 12)

  // ── DB operations (transactional) ───────────────────────────────
  const { db, client } = createApiDb()
  try {
    const now = new Date()

    await db.transaction(async (tx) => {
      // 1. Look up the invite token
      console.log('[accept-invite] looking up invite token...')
      const invite = await tx.query.verificationTokens.findFirst({
        where: (vt, { and, eq, gt }) =>
          and(eq(vt.token, tokenHash), gt(vt.expires, now)),
      })

      if (!invite) {
        console.warn('[accept-invite] token not found or expired')
        throw new ApiError(400, 'This invitation link is invalid or has expired. Please request a new one.')
      }

      const { identifier: email } = invite
      console.log(`[accept-invite] valid token for email=***@${email.split('@')[1]}`)

      // 2. Guard against concurrent requests creating duplicate accounts
      console.log('[accept-invite] checking for existing user...')
      const existingUser = await tx.query.users.findFirst({
        where: (u, { eq }) => eq(u.email, email),
      })

      if (existingUser) {
        console.warn('[accept-invite] account already exists — concurrent request?')
        throw new ApiError(409, 'This account is already set up. Please sign in.')
      }

      // 3. Create user
      const userId = generateId('usr')
      console.log(`[accept-invite] creating user — userId=${userId}`)
      await tx.insert(schema.users).values({
        id: userId,
        email,
        name: email.split('@')[0],
        passwordHash,
        emailVerified: now,
      })

      // 4. Create workspace
      const wsId = generateId('ws')
      const nameBase = email.split('@')[0]
      const slug =
        nameBase.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-') +
        '-' +
        wsId.slice(-4)

      console.log(`[accept-invite] creating workspace — wsId=${wsId} slug=${slug}`)
      await tx.insert(schema.workspaces).values({
        id: wsId,
        name: `${nameBase}'s Workspace`,
        slug,
      })
      await tx.insert(schema.workspaceMembers).values({
        id: generateId('wm'),
        workspaceId: wsId,
        userId,
        role: 'owner',
      })

      // 5. Consume the token (single-use)
      console.log('[accept-invite] consuming token...')
      await tx.delete(schema.verificationTokens).where(
        and(
          eq(schema.verificationTokens.identifier, email),
          eq(schema.verificationTokens.token, tokenHash),
        ),
      )
    })

    console.log('[accept-invite] done ✓')
    return NextResponse.json({ success: true })

  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[accept-invite] unexpected error:', err)
    return NextResponse.json(
      { error: 'Something went wrong on our end. Please try again.' },
      { status: 500 },
    )
  } finally {
    await client.end()
  }
}

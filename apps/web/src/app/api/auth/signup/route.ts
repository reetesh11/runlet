import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { randomBytes, createHash } from 'crypto'
import { eq } from 'drizzle-orm'
import { createApiDb, schema } from '@/lib/db'
import { checkRateLimit } from '@/lib/rate-limit'
import { sendInvitationEmail } from '@/lib/email'

const SignupSchema = z.object({
  email: z.string().email('Please enter a valid email address').toLowerCase().trim(),
})

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() ?? '127.0.0.1'
  console.log(`[signup] POST — ip=${ip}`)

  // ── Rate limit ─────────────────────────────────────────────────
  const { allowed } = await checkRateLimit(`rl:signup:${ip}`, 5, 3600)
  if (!allowed) {
    console.warn(`[signup] rate limited — ip=${ip}`)
    return NextResponse.json(
      { error: 'Too many requests. Please try again in an hour.' },
      { status: 429 },
    )
  }

  // ── Parse body ─────────────────────────────────────────────────
  let body: unknown
  try {
    body = await req.json()
  } catch {
    console.warn('[signup] invalid JSON body')
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const parsed = SignupSchema.safeParse(body)
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Invalid input.'
    console.warn(`[signup] validation failed — ${msg}`)
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const { email } = parsed.data
  console.log(`[signup] valid request — email=***@${email.split('@')[1]}`)

  // ── DB operations (single try/catch so any DB error is visible) ─
  const { db, client } = createApiDb()
  try {
    const now = new Date()

    // 1. Check for an existing account
    console.log('[signup] checking for existing user...')
    const existingUser = await db.query.users.findFirst({
      where: (u, { eq }) => eq(u.email, email),
    })

    if (existingUser) {
      console.log('[signup] email already registered')
      return NextResponse.json(
        { error: 'This email is already registered. Please sign in instead.' },
        { status: 409 },
      )
    }

    // 2. Check for an existing invite token
    console.log('[signup] checking for existing invite token...')
    const existingToken = await db.query.verificationTokens.findFirst({
      where: (vt, { eq }) => eq(vt.identifier, email),
    })

    if (existingToken) {
      if (existingToken.expires > now) {
        console.log(`[signup] active invite already exists — expires=${existingToken.expires.toISOString()}`)
        return NextResponse.json(
          {
            error:
              'An invitation was already sent to this address. Please check your inbox (and spam folder). The link is valid for 24 hours.',
          },
          { status: 409 },
        )
      }
      // Expired — clean up so we can issue a fresh one
      console.log('[signup] expired invite found — deleting...')
      await db
        .delete(schema.verificationTokens)
        .where(eq(schema.verificationTokens.identifier, email))
    }

    // 3. Generate and store a new token
    // Raw token lives only in the email link; DB stores the SHA-256 hash
    const rawToken = randomBytes(32).toString('hex')
    const tokenHash = hashToken(rawToken)
    const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000)

    console.log(`[signup] inserting invite token — expires=${expires.toISOString()}`)
    await db.insert(schema.verificationTokens).values({
      identifier: email,
      token: tokenHash,
      expires,
    })

    // 4. Send invitation email
    console.log('[signup] sending invitation email...')
    try {
      await sendInvitationEmail(email, rawToken)
    } catch (err) {
      console.error('[signup] email send failed — rolling back token:', err)
      await db
        .delete(schema.verificationTokens)
        .where(eq(schema.verificationTokens.identifier, email))
      return NextResponse.json(
        { error: 'Failed to send invitation email. Please try again.' },
        { status: 500 },
      )
    }

    console.log('[signup] done ✓')
    return NextResponse.json({ success: true })

  } catch (err) {
    // Catches DB connection failures, timeouts, missing tables, etc.
    console.error('[signup] unexpected error:', err)
    return NextResponse.json(
      { error: 'Something went wrong on our end. Please try again.' },
      { status: 500 },
    )
  } finally {
    await client.end()
  }
}

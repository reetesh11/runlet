import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto'

// ── ID generation ──────────────────────────────────────────────
export function generateId(prefix: string): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = prefix + '_'
  for (let i = 0; i < 16; i++) {
    result += chars[Math.floor(Math.random() * chars.length)]
  }
  return result
}

export function generateWebhookSecret(): string {
  return randomBytes(32).toString('hex')
}

// ── Encryption (AES-256-GCM) ────────────────────────────────────
export function encrypt(text: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex')
  const iv = randomBytes(16)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
}

export function decrypt(encryptedData: string, keyHex: string): string {
  const [ivHex, authTagHex, encrypted] = encryptedData.split(':')
  const key = Buffer.from(keyHex, 'hex')
  const iv = Buffer.from(ivHex!, 'hex')
  const authTag = Buffer.from(authTagHex!, 'hex')
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  let decrypted = decipher.update(encrypted!, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

// ── Hashing ────────────────────────────────────────────────────
export function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex')
}

export function hashPayload(payload: unknown): string {
  return sha256(JSON.stringify(payload))
}

// ── HMAC verification ──────────────────────────────────────────
import { createHmac, timingSafeEqual } from 'crypto'

export function verifyHmacSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  try {
    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    const expectedBuf = Buffer.from(`sha256=${expected}`)
    const providedBuf = Buffer.from(signature)
    if (expectedBuf.length !== providedBuf.length) return false
    return timingSafeEqual(expectedBuf, providedBuf)
  } catch {
    return false
  }
}

// ── Slug generation ────────────────────────────────────────────
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

// ── Retry with backoff ─────────────────────────────────────────
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  backoffMs = 1000
): Promise<T> {
  let lastError: Error | undefined
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < maxAttempts) {
        await sleep(backoffMs * Math.pow(2, attempt - 1))
      }
    }
  }
  throw lastError
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── Date helpers ───────────────────────────────────────────────
export function toISOString(date: Date): string {
  return date.toISOString()
}

export function nowIso(): string {
  return new Date().toISOString()
}

// ── Safe JSON parse ────────────────────────────────────────────
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}

// ── Pagination ─────────────────────────────────────────────────
export function getPaginationMeta(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  }
}

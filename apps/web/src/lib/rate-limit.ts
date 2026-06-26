/**
 * Rate limiter backed by Upstash Redis REST API.
 * Falls back to "allow" if Upstash is not configured (local dev).
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; remaining: number }> {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!url || !token) {
    return { allowed: true, remaining: limit }
  }

  try {
    const incrRes = await fetch(`${url}/incr/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const { result: count } = (await incrRes.json()) as { result: number }

    if (count === 1) {
      // First hit in this window — set the TTL
      await fetch(`${url}/expire/${encodeURIComponent(key)}/${windowSeconds}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
    }

    return { allowed: count <= limit, remaining: Math.max(0, limit - count) }
  } catch {
    // Upstash unavailable — fail open so auth is never blocked by infra issues
    return { allowed: true, remaining: limit }
  }
}

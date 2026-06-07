import 'server-only'

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

export type RateLimitResult = { ok: boolean; remaining: number; retryAfterSec: number }

/**
 * Limiteur de débit fenêtre-fixe, en mémoire process.
 * `limit` requêtes par `windowMs` et par `key`.
 *
 * NB (MVP) : l'état est par instance — non partagé entre instances serverless.
 * Pour une garantie multi-instance, brancher un store partagé (Redis / Upstash).
 */
export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  const bucket = buckets.get(key)

  if (!bucket || now >= bucket.resetAt) {
    if (buckets.size > 5_000) pruneExpired(now)
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, remaining: limit - 1, retryAfterSec: 0 }
  }

  if (bucket.count >= limit) {
    return { ok: false, remaining: 0, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) }
  }

  bucket.count += 1
  return { ok: true, remaining: limit - bucket.count, retryAfterSec: 0 }
}

function pruneExpired(now: number) {
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key)
  }
}

/** Clé IP raisonnable depuis les en-têtes d'une requête (proxy/Vercel). */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]!.trim()
  return req.headers.get('x-real-ip') ?? 'unknown'
}

/** Pour les tests : remet le compteur à zéro. */
export function __resetRateLimit() {
  buckets.clear()
}

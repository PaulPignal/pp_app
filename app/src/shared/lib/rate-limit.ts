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
    if (buckets.size >= MAX_BUCKETS) pruneExpired(now)
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, remaining: limit - 1, retryAfterSec: 0 }
  }

  if (bucket.count >= limit) {
    return { ok: false, remaining: 0, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) }
  }

  bucket.count += 1
  return { ok: true, remaining: limit - bucket.count, retryAfterSec: 0 }
}

// Plafond mémoire : au-delà, purge des fenêtres expirées puis, si besoin, des plus anciennes
// (une rafale de clés distinctes ne fait pas grossir la Map sans limite).
const MAX_BUCKETS = 5_000

function pruneExpired(now: number) {
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key)
  }
  for (const key of buckets.keys()) {
    if (buckets.size < MAX_BUCKETS) break
    buckets.delete(key)
  }
}

type HeaderSource = Headers | Record<string, string | string[] | undefined>

/**
 * IP du client. Hypothèse : déploiement Vercel, qui écrit lui-même `x-real-ip` et
 * `x-forwarded-for` (valeurs du client écrasées). `x-real-ip` d'abord : une seule valeur,
 * sans liste à interpréter.
 */
export function clientIp(source: { headers: HeaderSource }): string {
  const { headers } = source
  const get = (name: string) => {
    if (headers instanceof Headers) return headers.get(name)
    const value = headers[name]
    return (Array.isArray(value) ? value[0] : value) ?? null
  }
  return get('x-real-ip')?.trim() || get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

/** Pour les tests : remet le compteur à zéro. */
export function __resetRateLimit() {
  buckets.clear()
}

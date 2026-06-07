import { describe, it, expect, beforeEach } from 'vitest'
import { rateLimit, __resetRateLimit } from '@/shared/lib/rate-limit'

describe('rateLimit (fenêtre fixe)', () => {
  beforeEach(() => __resetRateLimit())

  it('autorise jusqu’à la limite puis bloque (avec retryAfter)', () => {
    const now = 1_000_000
    for (let i = 0; i < 3; i++) expect(rateLimit('k', 3, 1000, now).ok).toBe(true)
    const blocked = rateLimit('k', 3, 1000, now)
    expect(blocked.ok).toBe(false)
    expect(blocked.retryAfterSec).toBeGreaterThan(0)
  })

  it('réinitialise le compteur après la fenêtre', () => {
    const now = 2_000_000
    expect(rateLimit('k2', 1, 1000, now).ok).toBe(true)
    expect(rateLimit('k2', 1, 1000, now).ok).toBe(false)
    expect(rateLimit('k2', 1, 1000, now + 1001).ok).toBe(true)
  })

  it('isole les clés indépendamment', () => {
    const now = 3_000_000
    expect(rateLimit('a', 1, 1000, now).ok).toBe(true)
    expect(rateLimit('b', 1, 1000, now).ok).toBe(true)
    expect(rateLimit('a', 1, 1000, now).ok).toBe(false)
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
import { clientIp, rateLimit, __resetRateLimit } from '@/shared/lib/rate-limit'

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

  it('borne la mémoire : 6 000 clés distinctes ne laissent jamais plus de 5 000 fenêtres', () => {
    const now = 4_000_000
    for (let i = 0; i < 6_000; i++) rateLimit(`flood:${i}`, 1, 60_000, now)
    // La plus ancienne clé a été évincée : elle repart de zéro.
    expect(rateLimit('flood:0', 1, 60_000, now).ok).toBe(true)
    // Une clé récente est toujours comptée.
    expect(rateLimit('flood:5999', 1, 60_000, now).ok).toBe(false)
  })
})

describe('clientIp', () => {
  it('préfère x-real-ip, puis le premier x-forwarded-for, sinon unknown', () => {
    expect(clientIp(new Request('http://x', { headers: { 'x-real-ip': '1.1.1.1', 'x-forwarded-for': '9.9.9.9, 2.2.2.2' } }))).toBe('1.1.1.1')
    expect(clientIp(new Request('http://x', { headers: { 'x-forwarded-for': '9.9.9.9, 2.2.2.2' } }))).toBe('9.9.9.9')
    expect(clientIp(new Request('http://x'))).toBe('unknown')
  })

  it('lit aussi les en-têtes bruts de next-auth (objet)', () => {
    expect(clientIp({ headers: { 'x-real-ip': '3.3.3.3' } })).toBe('3.3.3.3')
    expect(clientIp({ headers: { 'x-forwarded-for': ['4.4.4.4'] } })).toBe('4.4.4.4')
  })
})

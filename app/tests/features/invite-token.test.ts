import { describe, it, expect, vi } from 'vitest'

// invite.ts lit env.INVITE_TOKEN_SECRET → on l'isole avec un secret déterministe.
vi.mock('@/server/env', () => ({
  env: { INVITE_TOKEN_SECRET: 'unit-test-secret-at-least-32-bytes-long!!' },
  isProduction: false,
}))

import { createInviteToken, verifyInviteToken } from '@/features/friendships/server/invite'

describe('invite token HMAC (sécurité)', () => {
  it('round-trip un token valide', () => {
    const token = createInviteToken('user-123')
    expect(verifyInviteToken(token).userId).toBe('user-123')
  })

  it('rejette une signature altérée', () => {
    const token = createInviteToken('user-123')
    const tampered = token.slice(0, -1) + (token.at(-1) === 'a' ? 'b' : 'a')
    expect(() => verifyInviteToken(tampered)).toThrow('invalid_invite_token')
  })

  it('rejette un payload forgé (usurpation de userId)', () => {
    const token = createInviteToken('user-123')
    const signature = token.split('.')[1]
    const forgedPayload = Buffer.from(
      JSON.stringify({ userId: 'attacker', exp: Date.now() + 1_000_000 }),
    ).toString('base64url')
    expect(() => verifyInviteToken(`${forgedPayload}.${signature}`)).toThrow('invalid_invite_token')
  })

  it('rejette un token expiré', () => {
    const token = createInviteToken('user-123', -1_000)
    expect(() => verifyInviteToken(token)).toThrow('expired_invite_token')
  })

  it('rejette une entrée malformée', () => {
    expect(() => verifyInviteToken('garbage')).toThrow('invalid_invite_token')
    expect(() => verifyInviteToken('')).toThrow('invalid_invite_token')
  })
})

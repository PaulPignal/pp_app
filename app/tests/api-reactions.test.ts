import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requireSessionUserMock, setReactionStatusMock, clearReactionMock } = vi.hoisted(() => ({
  requireSessionUserMock: vi.fn(),
  setReactionStatusMock: vi.fn(),
  clearReactionMock: vi.fn(),
}))

vi.mock('@/features/auth/server/session', () => ({
  requireSessionUser: requireSessionUserMock,
  isUnauthorizedError: (error: unknown) => error instanceof Error && error.message === 'unauthorized',
}))

vi.mock('@/features/reactions/server/commands', () => ({
  setReactionStatus: setReactionStatusMock,
  clearReaction: clearReactionMock,
}))

import { DELETE, POST } from '@/app/api/reactions/route'
import { __resetRateLimit } from '@/shared/lib/rate-limit'

function postReaction() {
  return POST(
    new Request('http://localhost/api/reactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workId: 'w1', status: 'LIKE' }),
    }),
  )
}

describe('/api/reactions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetRateLimit()
    requireSessionUserMock.mockResolvedValue({ id: 'u1', email: 'u1@example.com' })
    setReactionStatusMock.mockResolvedValue({ reaction: { workId: 'w1', status: 'LIKE' } })
    clearReactionMock.mockResolvedValue(undefined)
  })

  it('401 sans session', async () => {
    requireSessionUserMock.mockRejectedValue(new Error('unauthorized'))
    const res = await postReaction()
    expect(res.status).toBe(401)
    expect(setReactionStatusMock).not.toHaveBeenCalled()
  })

  it('limite à 120 réactions par minute et par utilisateur (POST et DELETE confondus)', async () => {
    for (let i = 0; i < 119; i += 1) {
      expect((await postReaction()).status).toBe(200)
    }
    expect((await DELETE(new Request('http://localhost/api/reactions?workId=w1', { method: 'DELETE' }))).status).toBe(200)

    const limited = await postReaction()
    expect(limited.status).toBe(429)
    expect(await limited.json()).toMatchObject({ ok: false, error: 'rate_limited' })
    expect(setReactionStatusMock).toHaveBeenCalledTimes(119)

    // Un autre utilisateur n'est pas affecté.
    requireSessionUserMock.mockResolvedValue({ id: 'u2', email: 'u2@example.com' })
    expect((await postReaction()).status).toBe(200)
  })
})

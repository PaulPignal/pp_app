import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requireSessionUserMock, acceptMock, declineMock } = vi.hoisted(() => ({
  requireSessionUserMock: vi.fn(),
  acceptMock: vi.fn(),
  declineMock: vi.fn(),
}))

vi.mock('@/features/auth/server/session', () => ({
  requireSessionUser: requireSessionUserMock,
  isUnauthorizedError: (error: unknown) => error instanceof Error && error.message === 'unauthorized',
}))

vi.mock('@/features/friendships/server/commands', () => ({
  acceptFriendRequest: acceptMock,
  declineFriendRequest: declineMock,
}))

import { POST } from '@/app/api/friends/requests/route'

function post(body: unknown) {
  return POST(
    new Request('http://localhost/api/friends/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

describe('/api/friends/requests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireSessionUserMock.mockResolvedValue({ id: 'me', email: 'me@example.com' })
  })

  it('accepts a request and returns the friend', async () => {
    acceptMock.mockResolvedValue({ id: 'req-1', email: 'req@example.com' })

    const response = await post({ requesterId: 'req-1', action: 'accept' })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ ok: true, friend: { id: 'req-1', email: 'req@example.com' } })
    expect(acceptMock).toHaveBeenCalledWith({ userId: 'me', requesterId: 'req-1' })
  })

  it('declines a request', async () => {
    declineMock.mockResolvedValue(undefined)

    const response = await post({ requesterId: 'req-1', action: 'decline' })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ ok: true, declined: true })
    expect(declineMock).toHaveBeenCalledWith({ userId: 'me', requesterId: 'req-1' })
  })

  it('returns 404 when the request no longer exists', async () => {
    acceptMock.mockRejectedValue(new Error('request_not_found'))

    const response = await post({ requesterId: 'req-1', action: 'accept' })
    const payload = await response.json()

    expect(response.status).toBe(404)
    expect(payload).toEqual({ ok: false, error: 'request_not_found' })
  })

  it('returns 400 on invalid body', async () => {
    const response = await post({ requesterId: '', action: 'nope' })
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toMatchObject({ ok: false, error: 'invalid_friend_input' })
  })
})

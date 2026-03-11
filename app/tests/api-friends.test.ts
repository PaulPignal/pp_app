import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requireSessionUserMock, createInviteTokenMock, listFriendsMock, addFriendMock } = vi.hoisted(() => ({
  requireSessionUserMock: vi.fn(),
  createInviteTokenMock: vi.fn(),
  listFriendsMock: vi.fn(),
  addFriendMock: vi.fn(),
}))

vi.mock('@/features/auth/server/session', () => ({
  requireSessionUser: requireSessionUserMock,
  isUnauthorizedError: (error: unknown) => error instanceof Error && error.message === 'unauthorized',
}))

vi.mock('@/features/friendships/server/invite', () => ({
  createInviteToken: createInviteTokenMock,
}))

vi.mock('@/features/friendships/server/queries', () => ({
  listFriends: listFriendsMock,
}))

vi.mock('@/features/friendships/server/commands', () => ({
  addFriend: addFriendMock,
}))

import { GET, POST } from '@/app/api/friends/route'

describe('/api/friends', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns only public friend fields', async () => {
    requireSessionUserMock.mockResolvedValue({ id: 'me', email: 'me@example.com' })
    listFriendsMock.mockResolvedValue([{ id: 'friend-1', email: 'friend@example.com' }])

    const response = await GET(new Request('http://localhost/api/friends'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      ok: true,
      friends: [{ id: 'friend-1', email: 'friend@example.com' }],
    })
    expect(listFriendsMock).toHaveBeenCalledWith('me')
  })

  it('returns an invite token for the authenticated user', async () => {
    requireSessionUserMock.mockResolvedValue({ id: 'me', email: 'me@example.com' })
    createInviteTokenMock.mockReturnValue('signed-token')

    const response = await GET(new Request('http://localhost/api/friends?invite=1'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ ok: true, token: 'signed-token' })
    expect(createInviteTokenMock).toHaveBeenCalledWith('me')
  })

  it('returns 400 when the body is invalid', async () => {
    requireSessionUserMock.mockResolvedValue({ id: 'me', email: 'me@example.com' })

    const response = await POST(
      new Request('http://localhost/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nope: true }),
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toMatchObject({ ok: false, error: 'invalid_friend_input' })
  })

  it('returns feature errors with the expected HTTP code', async () => {
    requireSessionUserMock.mockResolvedValue({ id: 'me', email: 'me@example.com' })
    addFriendMock.mockRejectedValue(new Error('friend_not_found'))

    const response = await POST(
      new Request('http://localhost/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'friend@example.com' }),
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(404)
    expect(payload).toEqual({ ok: false, error: 'friend_not_found' })
  })

  it('returns the added friend on success', async () => {
    requireSessionUserMock.mockResolvedValue({ id: 'me', email: 'me@example.com' })
    addFriendMock.mockResolvedValue({ id: 'friend-1', email: 'friend@example.com' })

    const response = await POST(
      new Request('http://localhost/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'x'.repeat(32) }),
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      ok: true,
      friend: { id: 'friend-1', email: 'friend@example.com' },
    })
    expect(addFriendMock).toHaveBeenCalledWith({
      userId: 'me',
      userEmail: 'me@example.com',
      input: { token: 'x'.repeat(32) },
    })
  })
})

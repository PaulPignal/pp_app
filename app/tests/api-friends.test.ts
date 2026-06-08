import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  requireSessionUserMock,
  createInviteTokenMock,
  listFriendsMock,
  listIncomingRequestsMock,
  addFriendMock,
  removeFriendMock,
} = vi.hoisted(() => ({
  requireSessionUserMock: vi.fn(),
  createInviteTokenMock: vi.fn(),
  listFriendsMock: vi.fn(),
  listIncomingRequestsMock: vi.fn(),
  addFriendMock: vi.fn(),
  removeFriendMock: vi.fn(),
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
  listIncomingRequests: listIncomingRequestsMock,
}))

vi.mock('@/features/friendships/server/commands', () => ({
  addFriend: addFriendMock,
  removeFriend: removeFriendMock,
}))

import { DELETE, GET, POST } from '@/app/api/friends/route'

describe('/api/friends', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns public friend fields and pending requests', async () => {
    requireSessionUserMock.mockResolvedValue({ id: 'me', email: 'me@example.com' })
    listFriendsMock.mockResolvedValue([{ id: 'friend-1', email: 'friend@example.com' }])
    listIncomingRequestsMock.mockResolvedValue([{ id: 'req-1', email: 'req@example.com' }])

    const response = await GET(new Request('http://localhost/api/friends'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      ok: true,
      friends: [{ id: 'friend-1', email: 'friend@example.com' }],
      requests: [{ id: 'req-1', email: 'req@example.com' }],
    })
    expect(listFriendsMock).toHaveBeenCalledWith('me')
    expect(listIncomingRequestsMock).toHaveBeenCalledWith('me')
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

  it('returns the added friend and status on success', async () => {
    requireSessionUserMock.mockResolvedValue({ id: 'me', email: 'me@example.com' })
    addFriendMock.mockResolvedValue({ friend: { id: 'friend-1', email: 'friend@example.com' }, status: 'accepted' })

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
      status: 'accepted',
    })
    expect(addFriendMock).toHaveBeenCalledWith({
      userId: 'me',
      userEmail: 'me@example.com',
      input: { token: 'x'.repeat(32) },
    })
  })

  it('returns pending status for an email invitation', async () => {
    requireSessionUserMock.mockResolvedValue({ id: 'me', email: 'me@example.com' })
    addFriendMock.mockResolvedValue({ friend: { id: 'friend-2', email: 'new@example.com' }, status: 'pending' })

    const response = await POST(
      new Request('http://localhost/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'new@example.com' }),
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      ok: true,
      friend: { id: 'friend-2', email: 'new@example.com' },
      status: 'pending',
    })
  })

  it('removes a friend via DELETE', async () => {
    requireSessionUserMock.mockResolvedValue({ id: 'me', email: 'me@example.com' })
    removeFriendMock.mockResolvedValue(undefined)

    const response = await DELETE(new Request('http://localhost/api/friends?friendId=friend-1', { method: 'DELETE' }))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ ok: true, removed: true })
    expect(removeFriendMock).toHaveBeenCalledWith({ userId: 'me', friendId: 'friend-1' })
  })

  it('rejects DELETE without friendId', async () => {
    requireSessionUserMock.mockResolvedValue({ id: 'me', email: 'me@example.com' })

    const response = await DELETE(new Request('http://localhost/api/friends', { method: 'DELETE' }))
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toMatchObject({ ok: false, error: 'invalid_friend_input' })
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { authMock, createInviteTokenMock, verifyInviteTokenMock, prisma } = vi.hoisted(() => ({
  authMock: vi.fn(),
  createInviteTokenMock: vi.fn(),
  verifyInviteTokenMock: vi.fn(),
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    friendship: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/auth', () => ({
  auth: authMock,
}))

vi.mock('@/server/db', () => ({
  prisma,
}))

vi.mock('@/lib/invite', () => ({
  createInviteToken: createInviteTokenMock,
  verifyInviteToken: verifyInviteTokenMock,
}))

import { GET, POST } from '@/app/api/friends/route'

describe('/api/friends', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prisma.$transaction.mockImplementation(async (operations: Array<Promise<unknown>>) => Promise.all(operations))
  })

  it('returns only public friend fields', async () => {
    authMock.mockResolvedValue({ user: { email: 'me@example.com' } })
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'me',
      email: 'me@example.com',
      passwordHash: 'secret',
    })
    prisma.friendship.findMany.mockResolvedValueOnce([
      {
        friend: {
          id: 'friend-1',
          email: 'friend@example.com',
        },
      },
    ])

    const response = await GET(new Request('http://localhost/api/friends'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      friends: [{ id: 'friend-1', email: 'friend@example.com' }],
    })
    expect(prisma.friendship.findMany).toHaveBeenCalledWith({
      where: { userId: 'me' },
      select: {
        friend: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    })
  })

  it('returns an invite token for the authenticated user', async () => {
    authMock.mockResolvedValue({ user: { email: 'me@example.com' } })
    prisma.user.findUnique.mockResolvedValueOnce({ id: 'me', email: 'me@example.com' })
    createInviteTokenMock.mockReturnValue('signed-token')

    const response = await GET(new Request('http://localhost/api/friends?invite=1'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ token: 'signed-token' })
    expect(createInviteTokenMock).toHaveBeenCalledWith('me')
  })

  it('rejects self invitation tokens', async () => {
    authMock.mockResolvedValue({ user: { email: 'me@example.com' } })
    prisma.user.findUnique.mockResolvedValueOnce({ id: 'me', email: 'me@example.com' })
    verifyInviteTokenMock.mockReturnValue({ userId: 'me' })

    const response = await POST(
      new Request('http://localhost/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'x'.repeat(32) }),
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toEqual({ error: 'cannot_add_self' })
  })

  it('returns invite verification errors as 400', async () => {
    authMock.mockResolvedValue({ user: { email: 'me@example.com' } })
    prisma.user.findUnique.mockResolvedValueOnce({ id: 'me', email: 'me@example.com' })
    verifyInviteTokenMock.mockImplementation(() => {
      throw new Error('expired_invite_token')
    })

    const response = await POST(
      new Request('http://localhost/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'x'.repeat(32) }),
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toEqual({ error: 'expired_invite_token' })
  })

  it('creates the two symmetric friendship rows', async () => {
    authMock.mockResolvedValue({ user: { email: 'me@example.com' } })
    prisma.user.findUnique
      .mockResolvedValueOnce({ id: 'me', email: 'me@example.com' })
      .mockResolvedValueOnce({ id: 'friend-1' })
    verifyInviteTokenMock.mockReturnValue({ userId: 'friend-1' })
    prisma.friendship.upsert.mockResolvedValue({})

    const response = await POST(
      new Request('http://localhost/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'x'.repeat(32) }),
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ ok: true, friendId: 'friend-1' })
    expect(prisma.friendship.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { userId_friendId: { userId: 'me', friendId: 'friend-1' } },
      }),
    )
    expect(prisma.friendship.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { userId_friendId: { userId: 'friend-1', friendId: 'me' } },
      }),
    )
  })

  it('adds a friend by normalized email', async () => {
    authMock.mockResolvedValue({ user: { email: 'me@example.com' } })
    prisma.user.findUnique
      .mockResolvedValueOnce({ id: 'me', email: 'me@example.com' })
      .mockResolvedValueOnce({ id: 'friend-1' })
    prisma.friendship.upsert.mockResolvedValue({})

    const response = await POST(
      new Request('http://localhost/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: ' Friend@Example.com ' }),
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ ok: true, friendId: 'friend-1' })
    expect(prisma.user.findUnique).toHaveBeenNthCalledWith(2, {
      where: { email: 'friend@example.com' },
      select: { id: true },
    })
  })

  it('rejects adding yourself by email', async () => {
    authMock.mockResolvedValue({ user: { email: 'me@example.com' } })
    prisma.user.findUnique.mockResolvedValueOnce({ id: 'me', email: 'me@example.com' })

    const response = await POST(
      new Request('http://localhost/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'ME@example.com' }),
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toEqual({ error: 'cannot_add_self' })
  })
})

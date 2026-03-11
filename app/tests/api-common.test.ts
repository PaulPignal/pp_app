import { beforeEach, describe, expect, it, vi } from 'vitest'

const { authMock, getPrismaMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  getPrismaMock: vi.fn(),
}))

vi.mock('@/auth', () => ({
  auth: authMock,
}))

vi.mock('@/lib/prisma', () => ({
  getPrisma: getPrismaMock,
}))

import { GET } from '@/app/api/common/route'

describe('/api/common', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 400 when friendId is missing', async () => {
    authMock.mockResolvedValue({ user: { id: 'me' } })
    getPrismaMock.mockResolvedValue({})

    const response = await GET(new Request('http://localhost/api/common'))
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toMatchObject({ ok: false, error: 'invalid_query' })
  })

  it('returns 403 when the friendship does not exist', async () => {
    authMock.mockResolvedValue({ user: { id: 'me' } })
    getPrismaMock.mockResolvedValue({
      friendship: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    })

    const response = await GET(new Request('http://localhost/api/common?friendId=friend-1'))
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload).toEqual({ ok: false, error: 'forbidden' })
  })

  it('returns only works liked by both friends', async () => {
    const friendshipFindUnique = vi.fn().mockResolvedValue({ id: 'fs-1' })
    const reactionFindMany = vi.fn().mockResolvedValue([
      { userId: 'me', workId: 'common-1' },
      { userId: 'friend-1', workId: 'common-1' },
      { userId: 'me', workId: 'solo-me' },
      { userId: 'friend-1', workId: 'solo-friend' },
    ])
    const workFindMany = vi.fn().mockResolvedValue([
      { id: 'common-1', title: 'Hamlet', venue: 'Odéon', imageUrl: null },
    ])

    authMock.mockResolvedValue({ user: { id: 'me' } })
    getPrismaMock.mockResolvedValue({
      friendship: { findUnique: friendshipFindUnique },
      reaction: { findMany: reactionFindMany },
      work: { findMany: workFindMany },
    })

    const response = await GET(new Request('http://localhost/api/common?friendId=friend-1'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      ok: true,
      works: [{ id: 'common-1', title: 'Hamlet', venue: 'Odéon', imageUrl: null }],
    })
    expect(workFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['common-1'] } },
      }),
    )
  })
})

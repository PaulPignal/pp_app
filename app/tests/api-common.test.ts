import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requireSessionUserMock, listCommonLikedWorksMock, FriendshipForbiddenErrorMock } = vi.hoisted(() => {
  class FriendshipForbiddenError extends Error {
    constructor() {
      super('forbidden')
    }
  }

  return {
    requireSessionUserMock: vi.fn(),
    listCommonLikedWorksMock: vi.fn(),
    FriendshipForbiddenErrorMock: FriendshipForbiddenError,
  }
})

vi.mock('@/features/auth/server/session', () => ({
  requireSessionUser: requireSessionUserMock,
  isUnauthorizedError: (error: unknown) => error instanceof Error && error.message === 'unauthorized',
}))

vi.mock('@/features/common/server/queries', () => ({
  FriendshipForbiddenError: FriendshipForbiddenErrorMock,
  listCommonLikedWorks: listCommonLikedWorksMock,
}))

import { GET } from '@/app/api/common/route'

describe('/api/common', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 400 when friendId is missing', async () => {
    requireSessionUserMock.mockResolvedValue({ id: 'me', email: 'me@example.com' })

    const response = await GET(new Request('http://localhost/api/common'))
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toMatchObject({ ok: false, error: 'invalid_query' })
  })

  it('returns 403 when the friendship does not exist', async () => {
    requireSessionUserMock.mockResolvedValue({ id: 'me', email: 'me@example.com' })
    listCommonLikedWorksMock.mockRejectedValue(new FriendshipForbiddenErrorMock())

    const response = await GET(new Request('http://localhost/api/common?friendId=friend-1'))
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload).toEqual({ ok: false, error: 'forbidden' })
  })

  it('returns common works from the feature query', async () => {
    requireSessionUserMock.mockResolvedValue({ id: 'me', email: 'me@example.com' })
    listCommonLikedWorksMock.mockResolvedValue([
      { id: 'common-1', title: 'Hamlet', section: 'theatre', imageUrl: null, venue: 'Odéon', address: null, category: null, description: null, startDate: null, endDate: null, durationMin: null, priceMin: null, priceMax: null, sourceUrl: null },
    ])

    const response = await GET(new Request('http://localhost/api/common?friendId=friend-1'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      ok: true,
      works: [
        {
          id: 'common-1',
          title: 'Hamlet',
          section: 'theatre',
          imageUrl: null,
          venue: 'Odéon',
          address: null,
          category: null,
          description: null,
          startDate: null,
          endDate: null,
          durationMin: null,
          priceMin: null,
          priceMax: null,
          sourceUrl: null,
        },
      ],
    })
    expect(listCommonLikedWorksMock).toHaveBeenCalledWith('me', 'friend-1')
  })
})

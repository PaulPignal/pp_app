import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prisma } = vi.hoisted(() => ({
  prisma: {
    work: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
  },
}))

vi.mock('@/server/db', () => ({ prisma }))

import { listDiscoverWorks } from '@/features/works/server/queries'

describe('listDiscoverWorks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('filters out works already reacted to by the current user', async () => {
    prisma.work.count.mockResolvedValue(1)
    prisma.work.findMany.mockResolvedValue([
      {
        id: 'work-1',
        title: 'Hamlet',
        imageUrl: null,
        category: null,
        venue: null,
        address: null,
        description: null,
        startDate: null,
        endDate: null,
        durationMin: null,
        priceMin: null,
        priceMax: null,
        sourceUrl: 'https://www.offi.fr/hamlet',
      },
    ])

    const result = await listDiscoverWorks({ userId: 'user-1', per: 25 })

    expect(result.total).toBe(1)
    expect(prisma.work.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { reactions: { none: { userId: 'user-1' } } },
        take: 25,
      }),
    )
  })
})

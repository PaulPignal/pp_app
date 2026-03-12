import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-12T10:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('filters out works already reacted to by the current user', async () => {
    prisma.work.count.mockResolvedValue(1)
    prisma.work.findMany.mockResolvedValue([
      {
        id: 'work-1',
        title: 'Hamlet',
        section: 'theatre',
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
        where: {
          OR: [{ endDate: null }, { endDate: { gte: new Date('2026-03-12T00:00:00.000Z') } }],
          reactions: { none: { userId: 'user-1' } },
        },
        take: 25,
      }),
    )
  })

  it('forwards section and category filters to Prisma', async () => {
    prisma.work.count.mockResolvedValue(0)
    prisma.work.findMany.mockResolvedValue([])

    await listDiscoverWorks({ userId: 'user-1', per: 25, section: 'cinema', category: 'drame' })

    expect(prisma.work.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ endDate: null }, { endDate: { gte: new Date('2026-03-12T00:00:00.000Z') } }],
          category: 'drame',
          section: 'cinema',
          reactions: { none: { userId: 'user-1' } },
        },
      }),
    )
  })

  it('excludes works whose end date is before today', async () => {
    prisma.work.count.mockResolvedValue(0)
    prisma.work.findMany.mockResolvedValue([])

    await listDiscoverWorks({ per: 10 })

    expect(prisma.work.count).toHaveBeenCalledWith({
      where: {
        OR: [{ endDate: null }, { endDate: { gte: new Date('2026-03-12T00:00:00.000Z') } }],
      },
    })
  })
})

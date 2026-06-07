import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prisma } = vi.hoisted(() => ({
  prisma: {
    reaction: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}))

vi.mock('@/server/db', () => ({ prisma }))

import { clearReaction, setReactionStatus } from '@/features/reactions/server/commands'

describe('setReactionStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns alreadyExisted when the previous status matches', async () => {
    prisma.reaction.findUnique.mockResolvedValue({ status: 'LIKE' })
    prisma.reaction.upsert.mockResolvedValue({ id: 'reaction-1', status: 'LIKE' })

    const result = await setReactionStatus({ userId: 'user-1', workId: 'work-1', status: 'LIKE' })

    expect(result.alreadyExisted).toBe(true)
    expect(prisma.reaction.upsert).toHaveBeenCalledWith({
      where: { userId_workId: { userId: 'user-1', workId: 'work-1' } },
      update: { status: 'LIKE' },
      create: { userId: 'user-1', workId: 'work-1', status: 'LIKE' },
    })
  })
})

describe('clearReaction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('supprime la réaction (user, work) et signale cleared=true', async () => {
    prisma.reaction.deleteMany.mockResolvedValue({ count: 1 })

    const result = await clearReaction({ userId: 'user-1', workId: 'work-1' })

    expect(result.cleared).toBe(true)
    expect(prisma.reaction.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', workId: 'work-1' },
    })
  })

  it('est idempotent : cleared=false quand rien à supprimer', async () => {
    prisma.reaction.deleteMany.mockResolvedValue({ count: 0 })

    const result = await clearReaction({ userId: 'user-1', workId: 'absent' })

    expect(result.cleared).toBe(false)
  })
})

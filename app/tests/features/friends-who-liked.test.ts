import { describe, expect, it, vi } from 'vitest'

// Câblage seulement (prisma simulé) : la forme renvoyée au client ne contient pas d'email.
const { prisma } = vi.hoisted(() => ({
  prisma: {
    friendship: { findMany: vi.fn() },
    reaction: { findMany: vi.fn() },
  },
}))

vi.mock('@/server/db', () => ({ prisma }))

import { friendsWhoLiked } from '@/features/reactions/server/queries'

describe('friendsWhoLiked', () => {
  it('renvoie le prénom lisible des amis, jamais leur email', async () => {
    prisma.friendship.findMany.mockResolvedValue([{ friendId: 'f1' }])
    prisma.reaction.findMany.mockResolvedValue([{ workId: 'w1', user: { id: 'f1', email: 'lea.martin@example.com' } }])

    const result = await friendsWhoLiked('me', ['w1'])

    expect(result).toEqual({ w1: [{ id: 'f1', name: 'Lea' }] })
    expect(JSON.stringify(result)).not.toContain('@')
  })

  it('aucune requête sans œuvre', async () => {
    prisma.reaction.findMany.mockClear()
    await expect(friendsWhoLiked('me', [])).resolves.toEqual({})
    expect(prisma.reaction.findMany).not.toHaveBeenCalled()
  })
})

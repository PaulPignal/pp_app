import { describe, expect, it, vi } from 'vitest'

// Câblage seulement (prisma simulé) : une seule requête, et aucune adresse email côté client.
// La justesse du filtre est vérifiée sur la base locale (voir le rapport T5).
const { prisma } = vi.hoisted(() => ({
  prisma: { reaction: { findMany: vi.fn() } },
}))

vi.mock('@/server/db', () => ({ prisma }))

import { friendsWhoLiked } from '@/features/reactions/server/queries'

describe('friendsWhoLiked', () => {
  it('une seule requête : likes des amis acceptés sur les œuvres de ma bibliothèque', async () => {
    prisma.reaction.findMany.mockResolvedValue([{ workId: 'w1', user: { id: 'f1', email: 'lea.martin@example.com' } }])

    const result = await friendsWhoLiked('me')

    expect(prisma.reaction.findMany).toHaveBeenCalledTimes(1)
    expect(prisma.reaction.findMany.mock.calls[0][0].where).toEqual({
      status: 'LIKE',
      user: { friendshipsReceived: { some: { userId: 'me', status: 'ACCEPTED' } } },
      work: { reactions: { some: { userId: 'me', status: { in: ['LIKE', 'SEEN'] } } } },
    })
    expect(result).toEqual({ w1: [{ id: 'f1', name: 'Lea' }] })
    expect(JSON.stringify(result)).not.toContain('@')
  })
})

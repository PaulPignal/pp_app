import 'server-only'

import { prisma } from '@/server/db'
import { mapWorkToCardDto, workCardSelect } from '@/features/works/dto'

export class FriendshipForbiddenError extends Error {
  constructor() {
    super('forbidden')
    this.name = 'FriendshipForbiddenError'
  }
}

export async function listCommonLikedWorks(userId: string, friendId: string) {
  const friendship = await prisma.friendship.findUnique({
    where: { userId_friendId: { userId, friendId } },
    select: { id: true },
  })

  if (!friendship) {
    throw new FriendshipForbiddenError()
  }

  // Intersection poussée en SQL (deux EXISTS) : une seule requête, aucun
  // sur-transfert de réactions vers l'application, aucune jointure en mémoire.
  const works = await prisma.work.findMany({
    where: {
      AND: [
        { reactions: { some: { userId, status: 'LIKE' } } },
        { reactions: { some: { userId: friendId, status: 'LIKE' } } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    select: workCardSelect,
  })

  return works.map(mapWorkToCardDto)
}

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

  const reactions = await prisma.reaction.findMany({
    where: {
      status: 'LIKE',
      userId: { in: [userId, friendId] },
    },
    select: { userId: true, workId: true },
  })

  const workIdToUsers = new Map<string, Set<string>>()
  for (const reaction of reactions) {
    const users = workIdToUsers.get(reaction.workId) ?? new Set<string>()
    users.add(reaction.userId)
    workIdToUsers.set(reaction.workId, users)
  }

  const commonIds = [...workIdToUsers.entries()]
    .filter(([, users]) => users.has(userId) && users.has(friendId))
    .map(([workId]) => workId)

  if (commonIds.length === 0) {
    return []
  }

  const works = await prisma.work.findMany({
    where: { id: { in: commonIds } },
    orderBy: { createdAt: 'desc' },
    select: workCardSelect,
  })

  return works.map(mapWorkToCardDto)
}

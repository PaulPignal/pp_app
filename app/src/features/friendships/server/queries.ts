import 'server-only'

import { prisma } from '@/server/db'
import type { FriendSummaryDto } from '@/features/friendships/dto'

export async function listFriends(userId: string): Promise<FriendSummaryDto[]> {
  const friendships = await prisma.friendship.findMany({
    where: { userId },
    select: {
      friend: {
        select: {
          id: true,
          email: true,
        },
      },
    },
    orderBy: {
      friend: {
        email: 'asc',
      },
    },
  })

  return friendships.map((friendship) => friendship.friend)
}

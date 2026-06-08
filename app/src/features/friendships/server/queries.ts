import 'server-only'

import { prisma } from '@/server/db'
import type { FriendRequestDto, FriendSummaryDto } from '@/features/friendships/dto'

export async function listFriends(userId: string): Promise<FriendSummaryDto[]> {
  const friendships = await prisma.friendship.findMany({
    where: { userId, status: 'ACCEPTED' },
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

// Demandes reçues en attente : arêtes PENDING dont je suis la cible (friendId).
export async function listIncomingRequests(userId: string): Promise<FriendRequestDto[]> {
  const requests = await prisma.friendship.findMany({
    where: { friendId: userId, status: 'PENDING' },
    select: {
      user: {
        select: {
          id: true,
          email: true,
        },
      },
    },
    orderBy: {
      user: {
        email: 'asc',
      },
    },
  })

  return requests.map((request) => request.user)
}
